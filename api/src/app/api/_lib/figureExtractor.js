/**
 * Figure Extraction from PDF Reports
 *
 * Extracts pages containing figures/charts from PDF documents and stores them as images
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Detect if a page contains figures based on text content
 * @param {string} pageText - Text content of the page
 * @returns {object|null} - Figure metadata if found, null otherwise
 */
function detectFigureInText(pageText) {
  const text = pageText || '';

  // Patterns to detect figures
  const patterns = [
    /(?:Figure|Fig\.?)\s*(\d+)(?:\s*[:\-–]?\s*([^\n]+))?/i,
    /(?:Chart|Graph)\s*(\d+)(?:\s*[:\-–]?\s*([^\n]+))?/i,
    /(?:Table)\s*(\d+)(?:\s*[:\-–]?\s*([^\n]+))?/i,
    /(?:Diagram)\s*(\d+)(?:\s*[:\-–]?\s*([^\n]+))?/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const figureNumber = parseInt(match[1], 10);
      const caption = match[0].trim(); // Full matched text as caption

      // Determine figure type
      let figureType = 'other';
      if (/chart/i.test(match[0])) figureType = 'chart';
      else if (/graph/i.test(match[0])) figureType = 'graph';
      else if (/table/i.test(match[0])) figureType = 'table';
      else if (/diagram/i.test(match[0])) figureType = 'diagram';
      else if (/figure|fig/i.test(match[0])) {
        // Try to infer from caption text
        const captionLower = caption.toLowerCase();
        if (captionLower.includes('bar') || captionLower.includes('pie') || captionLower.includes('chart')) {
          figureType = 'chart';
        } else if (captionLower.includes('graph')) {
          figureType = 'graph';
        }
      }

      return {
        figureNumber,
        caption,
        figureType
      };
    }
  }

  return null;
}

/**
 * Extract figures from a PDF buffer
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @param {string} reportId - Report UUID
 * @param {string} reportName - Report name for file naming
 * @returns {Promise<Array>} - Array of extracted figure metadata
 */
export async function extractFiguresFromPDF(pdfBuffer, reportId, reportName) {
  try {
    // Parse PDF to get text content per page
    const pdfParse = (await import('pdf-parse')).default;
    const pdfData = await pdfParse(pdfBuffer);

    const totalPages = pdfData.numpages;
    const fullText = pdfData.text || '';

    // Split text by page (heuristic: assume pages separated by form feeds or page markers)
    // This is a simple approach; for production, use pdf-parse with page-by-page parsing
    const pages = splitTextIntoPages(fullText, totalPages);

    const figures = [];
    const figurePages = new Set();

    // Detect figures in each page
    for (let pageNum = 0; pageNum < pages.length; pageNum++) {
      const pageText = pages[pageNum];
      const figureInfo = detectFigureInText(pageText);

      if (figureInfo && !figurePages.has(pageNum + 1)) {
        figurePages.add(pageNum + 1);
        figures.push({
          pageNumber: pageNum + 1,
          ...figureInfo
        });
      }
    }

    // If no figures detected, return empty array
    if (figures.length === 0) {
      console.log(`No figures detected in report ${reportId}`);
      return [];
    }

    console.log(`Detected ${figures.length} figures in report ${reportId}`);

    // Extract pages as images and upload to storage
    const { PDFDocument: PDFLib } = await import('pdf-lib');
    const pdfDoc = await PDFLib.load(pdfBuffer);

    const extractedFigures = [];

    for (const figure of figures) {
      try {
        // Create a new PDF with just this page
        const singlePagePdf = await PDFLib.create();
        const [copiedPage] = await singlePagePdf.copyPages(pdfDoc, [figure.pageNumber - 1]);
        singlePagePdf.addPage(copiedPage);

        const pdfBytes = await singlePagePdf.save();

        // Generate storage path
        const timestamp = Date.now();
        const safeName = reportName.replace(/[^a-zA-Z0-9_-]/g, '_');
        const storagePath = `report-figures/${reportId}/page_${figure.pageNumber}_fig_${figure.figureNumber || timestamp}.pdf`;

        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('reports')
          .upload(storagePath, pdfBytes, {
            contentType: 'application/pdf',
            upsert: false
          });

        if (uploadError) {
          console.error(`Failed to upload figure page ${figure.pageNumber}:`, uploadError);
          continue;
        }

        // Get public URL
        const { data: publicData } = supabase.storage
          .from('reports')
          .getPublicUrl(storagePath);

        const imageUrl = publicData.publicUrl;

        // Insert into database
        const { data: dbData, error: dbError } = await supabase
          .from('report_figures')
          .insert({
            report_id: reportId,
            page_number: figure.pageNumber,
            figure_number: figure.figureNumber,
            caption: figure.caption,
            image_url: imageUrl,
            storage_path: storagePath,
            figure_type: figure.figureType
          })
          .select()
          .single();

        if (dbError) {
          console.error(`Failed to insert figure metadata:`, dbError);
          continue;
        }

        extractedFigures.push(dbData);
        console.log(`Extracted figure from page ${figure.pageNumber}: ${figure.caption}`);

      } catch (error) {
        console.error(`Error extracting figure from page ${figure.pageNumber}:`, error);
      }
    }

    return extractedFigures;

  } catch (error) {
    console.error('Error extracting figures from PDF:', error);
    throw error;
  }
}

/**
 * Helper to split text into pages (heuristic)
 * @param {string} text - Full PDF text
 * @param {number} totalPages - Total number of pages
 * @returns {Array<string>} - Array of page texts
 */
function splitTextIntoPages(text, totalPages) {
  // Simple heuristic: split by form feed or divide equally
  const formFeedSplit = text.split('\f');

  if (formFeedSplit.length > 1) {
    return formFeedSplit;
  }

  // Fallback: divide text equally by page count
  const chunkSize = Math.ceil(text.length / totalPages);
  const pages = [];
  for (let i = 0; i < totalPages; i++) {
    pages.push(text.slice(i * chunkSize, (i + 1) * chunkSize));
  }
  return pages;
}

/**
 * Get figures for a report with smart limits based on report size
 * @param {string} reportId - Report UUID
 * @param {number} totalPages - Total pages in report
 * @returns {Promise<object>} - Figure response with metadata and images
 */
export async function getFiguresForReport(reportId, totalPages) {
  try {
    // Fetch all figures for the report
    const { data: figures, error } = await supabase
      .from('report_figures')
      .select('*')
      .eq('report_id', reportId)
      .order('page_number', { ascending: true });

    if (error) {
      throw error;
    }

    // Apply smart limits based on report size
    let maxFigures = 0;
    let message = '';

    if (totalPages < 5) {
      message = "This report is text-focused and doesn't contain visualizations. You can ask me specific questions about the content instead.";
      return {
        figures: [],
        totalFigures: figures?.length || 0,
        message,
        reportSize: 'small'
      };
    } else if (totalPages <= 15) {
      maxFigures = 2;
      message = `This report contains ${figures?.length || 0} visualization(s). Showing up to ${maxFigures} key figures.`;
    } else {
      maxFigures = 3;
      message = `This report contains ${figures?.length || 0} visualization(s). Showing up to ${maxFigures} key figures.`;
    }

    // Prioritize: charts > graphs > tables > diagrams > other
    const priorityOrder = { chart: 1, graph: 2, table: 3, diagram: 4, other: 5 };
    const sortedFigures = (figures || []).sort((a, b) => {
      const priorityA = priorityOrder[a.figure_type] || 5;
      const priorityB = priorityOrder[b.figure_type] || 5;
      if (priorityA !== priorityB) return priorityA - priorityB;
      return a.page_number - b.page_number;
    });

    // Limit figures
    const limitedFigures = sortedFigures.slice(0, maxFigures);

    return {
      figures: limitedFigures,
      totalFigures: figures?.length || 0,
      shownFigures: limitedFigures.length,
      message,
      reportSize: totalPages < 5 ? 'small' : totalPages <= 15 ? 'medium' : 'large'
    };

  } catch (error) {
    console.error('Error fetching figures:', error);
    throw error;
  }
}
