# Quick Start: Figure Extraction Feature

## TL;DR - 3 Steps to Get Running

### Step 1: Create Database Table (2 minutes)

Go to your Supabase Dashboard → SQL Editor, and run this:

```sql
-- Copy/paste from: supabase/migrations/create_report_figures_table.sql
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

CREATE INDEX idx_report_figures_report_id ON report_figures(report_id);
CREATE INDEX idx_report_figures_type ON report_figures(figure_type);
```

### Step 2: Start Dev Servers

```bash
# Terminal 1: Frontend
npm run dev

# Terminal 2: API
cd api
npm run dev
```

### Step 3: Test It

1. **Upload a test PDF:**
   - Go to http://localhost:5173/admin
   - Upload a PDF with figures (must have text like "Figure 1", "Chart 2", etc.)
   - Wait for "Indexing complete" message

2. **Test in chat:**
   - Go to http://localhost:5173/reports
   - Click the report you just uploaded
   - Type: **"Show me the available graphs in this report"**
   - See figures appear! 🎉

## What You'll See

### For Small Reports (< 5 pages):
```
User: "Show graphs"
Bot: "This report is text-focused and doesn't contain visualizations.
      You can ask me specific questions about the content instead."
```

### For Medium Reports (5-15 pages):
```
User: "Show available figures"
Bot: [Shows up to 2 figures with captions, page numbers, and embedded PDFs]
     "This report contains 5 visualization(s). Showing up to 2 key figures.
      💡 Tip: Showing 2 of 5 total figures. Ask about specific topics..."
```

### For Large Reports (> 15 pages):
```
User: "Display charts"
Bot: [Shows up to 3 figures prioritized by type: charts > graphs > tables]
     "This report contains 12 visualization(s). Showing up to 3 key figures."
```

## Example User Queries That Work

- "Show me the available graphs"
- "Display figures from this report"
- "What visualizations are available?"
- "Show charts"
- "List all graphs"
- "See available diagrams"

## Troubleshooting

### ❌ "No figures detected"
**Solution:** Your PDF needs explicit text like:
- ✅ "Figure 1: Sales Report"
- ✅ "Chart 2: Revenue Trends"
- ✅ "Table 3: Q4 Results"
- ❌ Just images without captions won't work

### ❌ Database error during upload
**Solution:** Run the SQL migration (Step 1 above)

### ❌ Figures not showing in chat
**Solution:**
- Check Supabase Storage bucket `reports` is public
- Check browser console for errors
- Verify figure URLs are accessible

## What Happens Behind the Scenes

```
1. Admin uploads PDF → API extracts text + figures
2. System detects pages with "Figure X" captions
3. Extracts those pages as separate PDFs
4. Stores in Supabase Storage (report-figures/{reportId}/...)
5. Saves metadata to report_figures table
6. User asks "show graphs" → API fetches figures with smart limits
7. Frontend displays inline with captions + preview
```

## Need More Help?

- **Full setup guide:** See `FIGURE_EXTRACTION_SETUP.md`
- **Implementation details:** See `IMPLEMENTATION_SUMMARY.md`
- **Customization:** Edit limits in `api/src/app/api/_lib/figureExtractor.js`

## Testing Checklist

- [ ] Database migration ran successfully
- [ ] Both dev servers running (frontend + API)
- [ ] Uploaded a PDF with figure captions
- [ ] Checked console logs (should see "Extracted N figures...")
- [ ] Opened report in chat
- [ ] Typed query: "show me the available graphs"
- [ ] Saw figures displayed inline
- [ ] Clicked "Open in new tab" link works

**If all checked ✅ → You're done! Feature is working.**

## Pro Tips

1. **Best test PDFs:** Research papers, financial reports, technical documentation
2. **Caption format:** System looks for "Figure 1", "Chart 2", "Table 3" patterns
3. **Custom limits:** Edit `maxFigures` in `figureExtractor.js` to change 2/3 limits
4. **Storage costs:** Figure PDFs are small (usually < 100KB each)

Enjoy! 🚀
