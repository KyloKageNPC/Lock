-- Create report_figures table to store extracted figures from PDF reports
CREATE TABLE IF NOT EXISTS report_figures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  figure_number INTEGER,
  caption TEXT,
  image_url TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  figure_type TEXT CHECK (figure_type IN ('chart', 'graph', 'table', 'diagram', 'other')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add index for faster lookups by report_id
CREATE INDEX idx_report_figures_report_id ON report_figures(report_id);

-- Add index for figure_type filtering
CREATE INDEX idx_report_figures_type ON report_figures(figure_type);

COMMENT ON TABLE report_figures IS 'Stores metadata and references to figures/charts extracted from PDF reports';
COMMENT ON COLUMN report_figures.page_number IS 'Page number in the PDF where the figure appears';
COMMENT ON COLUMN report_figures.figure_number IS 'Sequential figure number extracted from caption (e.g., 1 from "Figure 1")';
COMMENT ON COLUMN report_figures.caption IS 'Caption text (e.g., "Figure 1: Sales by Region")';
COMMENT ON COLUMN report_figures.image_url IS 'Public URL to access the figure image';
COMMENT ON COLUMN report_figures.storage_path IS 'Storage path in Supabase Storage bucket';
COMMENT ON COLUMN report_figures.figure_type IS 'Type of visualization (chart, graph, table, diagram, other)';
