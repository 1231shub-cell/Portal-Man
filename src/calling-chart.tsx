import React from 'react';
import { createRoot } from 'react-dom/client';
import { CallingReportChart } from './CallingReportChart';

function mountCallingChart() {
  const container = document.getElementById('mgmt-calling-chart-root');
  if (container && !container.hasAttribute('data-chart-mounted')) {
    container.setAttribute('data-chart-mounted', 'true');
    const root = createRoot(container);
    root.render(
      <React.StrictMode>
        <CallingReportChart />
      </React.StrictMode>
    );
  }
}

// Ensure mount when DOM is ready or if already ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountCallingChart);
} else {
  mountCallingChart();
}

// In case the tab was opened before DOM ready or dynamic re-renders
window.addEventListener('load', mountCallingChart);
