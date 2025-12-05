import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const LABELS = {
  '': 'Chat',
  admin: 'Admin',
};

export default function Breadcrumbs() {
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);

  // Ensure root breadcrumb exists even for '/'
  const paths = [''];
  segments.forEach((seg, idx) => {
    const prev = paths[paths.length - 1];
    paths.push(`${prev}/${seg}`.replace(/\/\/+/, '/'));
  });

  return (
    <div className="bg-[#0a0a0a] border-b border-gray-800 px-6 py-2 text-sm">
      <nav className="text-gray-400" aria-label="Breadcrumb">
        {paths.map((p, i) => {
          const isLast = i === paths.length - 1;
          const key = p === '' ? '' : p.split('/').filter(Boolean).pop();
          const label = LABELS[key ?? ''] || (key ? key.charAt(0).toUpperCase() + key.slice(1) : 'Chat');
          return (
            <span key={p} className="inline-flex items-center">
              {i > 0 && <span className="mx-2 text-gray-600">/</span>}
              {isLast ? (
                <span className="text-gray-200">{label}</span>
              ) : (
                <Link to={p || '/'} className="hover:text-gray-200">
                  {label}
                </Link>
              )}
            </span>
          );
        })}
      </nav>
    </div>
  );
}
