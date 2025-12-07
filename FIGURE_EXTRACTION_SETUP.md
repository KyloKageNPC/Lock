# Figure Extraction Setup Guide

## Overview

This feature enables smart extraction and display of figures/charts from PDF reports in the chat interface. The system automatically detects figures during report upload and allows users to request visualizations through natural language queries.

## Features

### 1. **Automatic Figure Detection**
- Extracts pages containing "Figure", "Fig", "Chart", "Graph", "Table", "Diagram"
- Stores figure metadata (page number, caption, type)
- Stores figure images as PDF pages in Supabase Storage

### 2. **Smart Display Limits**
Based on report size, the system applies intelligent limits:
- **< 5 pages**: No figures shown (text-focused report message)
- **5-15 pages**: Maximum 2 figures shown
- **> 15 pages**: Maximum 3 figures shown

### 3. **Priority Ranking**
Figures are prioritized by type:
1. Charts
2. Graphs
3. Tables
4. Diagrams
5. Other

### 4. **Natural Language Queries**
Users can ask:
- "Show me the available graphs in this report"
- "Display figures from this report"
- "What visualizations are available?"
- "Show me the charts"

## Setup Instructions

### Step 1: Run Database Migration

You need to create the `report_figures` table in your Supabase database.

**Option A: Using Supabase CLI (Recommended)**
```bash
# Make sure you have Supabase CLI installed
supabase db push

# Or apply the specific migration
supabase migration up
```

**Option B: Manual SQL Execution**
1. Go to your Supabase Dashboard
2. Navigate to SQL Editor
3. Copy and paste the contents of `supabase/migrations/create_report_figures_table.sql`
4. Execute the SQL

The migration will create:
- `report_figures` table with columns: id, report_id, page_number, figure_number, caption, image_url, storage_path, figure_type, created_at
- Indexes on `report_id` and `figure_type` for performance
- Foreign key constraint to `reports` table

### Step 2: Verify Dependencies

The required packages have been installed in the `api` directory:
- `pdf-lib` (for PDF page extraction)
- `pdf-parse` (already installed - for text extraction)
- `@supabase/supabase-js` (already installed)

### Step 3: Environment Variables

Ensure your `.env.local` file in the `api` directory has:
```env
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
OPENAI_API_KEY=your_openai_key
```

### Step 4: Storage Bucket Configuration

The system uses the existing `reports` bucket in Supabase Storage. Figure images are stored under the path:
```
report-figures/{reportId}/page_{pageNumber}_fig_{figureNumber}.pdf
```

Make sure the `reports` bucket is public or has appropriate access policies.

### Step 5: Test the Feature

1. **Start the development servers:**
   ```bash
   # Terminal 1: Frontend
   npm run dev

   # Terminal 2: API
   cd api && npm run dev
   ```

2. **Upload a PDF report as admin:**
   - Go to Admin page (`/admin`)
   - Upload a PDF with figures (e.g., a report with "Figure 1", "Chart 2", etc.)
   - Wait for indexing to complete
   - Check console logs for figure extraction messages

3. **Test in chat:**
   - Open the report in chat
   - Type: "Show me the available graphs"
   - You should see extracted figures displayed inline

## Architecture

### File Structure

```
api/src/app/api/
├── _lib/
│   └── figureExtractor.js          # Core figure extraction logic
├── index-report/
│   └── route.js                     # Updated to extract figures on upload
├── answer/
│   └── route.js                     # Updated to handle figure queries
└── reports/
    └── [reportId]/
        └── figures/
            └── route.js             # API endpoint to fetch figures

src/components/
├── FigureMessage.jsx                # Component to display figures
└── ChatInterface.jsx                # Updated to handle 'figures' message type

supabase/migrations/
└── create_report_figures_table.sql  # Database schema
```

### Data Flow

1. **Upload Flow:**
   ```
   Admin uploads PDF → index-report API
   ↓
   Extract text & create embeddings (existing)
   ↓
   Extract figures (NEW)
   ↓
   Store figure pages in Supabase Storage
   ↓
   Save metadata to report_figures table
   ```

2. **Query Flow:**
   ```
   User asks "show graphs" in chat
   ↓
   ChatInterface sends to /api/answer
   ↓
   answer route detects figure query
   ↓
   Calls getFiguresForReport() with smart limits
   ↓
   Returns { type: 'figures', figures: [...], message: '...' }
   ↓
   ChatInterface renders FigureMessage component
   ↓
   User sees figure images inline
   ```

### Database Schema

**report_figures table:**
- `id` (UUID, Primary Key)
- `report_id` (UUID, Foreign Key → reports.id)
- `page_number` (INTEGER) - Page in PDF
- `figure_number` (INTEGER) - Extracted from caption (e.g., 1 from "Figure 1")
- `caption` (TEXT) - Full caption text
- `image_url` (TEXT) - Public Supabase Storage URL
- `storage_path` (TEXT) - Path in storage bucket
- `figure_type` (TEXT) - One of: chart, graph, table, diagram, other
- `created_at` (TIMESTAMP)

## Usage Examples

### User Queries

**Query 1: General request**
```
User: "Show me the graphs in this report"
Response: Displays up to 2-3 figures based on report size
```

**Query 2: Small report**
```
User: "Show visualizations"
Response: "This report is text-focused and doesn't contain visualizations.
           You can ask me specific questions about the content instead."
```

**Query 3: Many figures**
```
User: "Display figures"
Response: "This report contains 8 visualization(s). Showing up to 3 key figures.
           [Figure 1, Figure 3, Chart 5 displayed]
           Tip: Showing 3 of 8 total figures. Ask about specific topics to see related figures."
```

## Customization

### Adjust Figure Limits

Edit `api/src/app/api/_lib/figureExtractor.js`:
```javascript
// Around line 150
if (totalPages < 5) {
  maxFigures = 0;  // Change to allow small reports
} else if (totalPages <= 15) {
  maxFigures = 2;  // Change medium report limit
} else {
  maxFigures = 3;  // Change large report limit
}
```

### Customize Figure Detection Patterns

Edit `api/src/app/api/_lib/figureExtractor.js`:
```javascript
// Around line 30
const patterns = [
  /(?:Figure|Fig\.?)\s*(\d+)(?:\s*[:\-–]?\s*([^\n]+))?/i,
  /(?:Chart|Graph)\s*(\d+)(?:\s*[:\-–]?\s*([^\n]+))?/i,
  // Add your custom patterns here
];
```

### Customize Chat Query Detection

Edit `api/src/app/api/answer/route.js`:
```javascript
// Around line 82
const wantsFigures = /\b(show|display|view|see|available|list).*\b(figure|graph|chart|visual|image|diagram)\b/i;
```

## Troubleshooting

### Issue: Figures not extracting
**Solution:**
- Check console logs during upload
- Verify PDF contains text like "Figure 1", "Chart 2", etc.
- Check Supabase Storage bucket permissions

### Issue: Database error on upload
**Solution:**
- Verify `report_figures` table exists
- Check foreign key constraint to `reports` table
- Verify Supabase service role key is set

### Issue: Figures not displaying in chat
**Solution:**
- Check browser console for errors
- Verify figure URLs are accessible
- Check `reports` storage bucket is public

### Issue: "No figures detected" message
**Solution:**
- PDF might not have recognizable figure captions
- Try PDFs with explicit "Figure 1", "Chart 2" labels
- Check extraction patterns in `figureExtractor.js`

## Future Enhancements

Potential improvements:
1. **Image-based detection**: Use computer vision to detect charts/graphs visually
2. **OCR for scanned PDFs**: Extract text from image-based PDFs
3. **Interactive filtering**: Let users filter by figure type (charts only, tables only)
4. **Figure search**: Semantic search across figure captions
5. **Higher quality images**: Convert PDF pages to PNG/JPG for better rendering
6. **Figure annotations**: Allow admins to manually tag/annotate figures

## API Reference

### POST /api/reports/[reportId]/figures
Get figures for a specific report.

**Response:**
```json
{
  "ok": true,
  "figures": [
    {
      "id": "uuid",
      "report_id": "uuid",
      "page_number": 5,
      "figure_number": 1,
      "caption": "Figure 1: Sales by Region",
      "image_url": "https://...",
      "storage_path": "report-figures/.../page_5_fig_1.pdf",
      "figure_type": "chart",
      "created_at": "2025-12-07T..."
    }
  ],
  "totalFigures": 8,
  "shownFigures": 3,
  "message": "This report contains 8 visualization(s). Showing up to 3 key figures.",
  "reportSize": "large",
  "reportId": "uuid",
  "reportName": "Q4 Report"
}
```

## License

This feature is part of the ChatPro application.
