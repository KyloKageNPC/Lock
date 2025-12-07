/**
 * FigureMessage Component
 *
 * Displays figure images from PDF reports in the chat interface
 */

import React from 'react';

export default function FigureMessage({ figureData }) {
  const {
    figures = [],
    totalFigures = 0,
    shownFigures = 0,
    message = '',
    reportSize = 'medium'
  } = figureData || {};

  if (!figureData) {
    return (
      <div className="p-4 bg-gray-100 rounded-lg">
        <p className="text-gray-600">No figure data available.</p>
      </div>
    );
  }

  // If report is too small, show message
  if (reportSize === 'small' || figures.length === 0) {
    return (
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-blue-800">{message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header message */}
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-800">{message}</p>
        {totalFigures > shownFigures && (
          <p className="text-xs text-blue-600 mt-2">
            Showing {shownFigures} of {totalFigures} total figures. Ask about specific topics to see related figures.
          </p>
        )}
      </div>

      {/* Figure display */}
      <div className="space-y-6">
        {figures.map((figure, index) => (
          <div
            key={figure.id || index}
            className="border border-gray-300 rounded-lg overflow-hidden bg-white shadow-sm"
          >
            {/* Figure caption */}
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-gray-800">
                    {figure.caption || `Figure ${figure.figure_number || index + 1}`}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Page {figure.page_number}
                    {figure.figure_type && (
                      <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                        {figure.figure_type}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Figure image (PDF page) */}
            <div className="p-4 bg-gray-50">
              <div className="bg-white border border-gray-200 rounded overflow-hidden">
                <iframe
                  src={figure.image_url}
                  className="w-full h-96"
                  title={figure.caption || `Figure ${figure.figure_number}`}
                  style={{ border: 'none' }}
                />
              </div>
              <div className="mt-2 text-center">
                <a
                  href={figure.image_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                >
                  Open in new tab
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer hint */}
      {figures.length > 0 && (
        <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
          <p className="text-xs text-gray-600">
            💡 <strong>Tip:</strong> Ask specific questions like "What does Figure 1 show?" or "Explain the trends in the bar chart" to get detailed insights.
          </p>
        </div>
      )}
    </div>
  );
}
