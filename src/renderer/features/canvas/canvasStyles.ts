// Dynamically inject styles
export const injectCanvasStyles = () => {
  const canvasStyles = `
    .react-flow__edge.selected .react-flow__edge-path {
      stroke: #f59e0b !important;
      stroke-width: 3px !important;
    }
    
    .react-flow__edge:hover .react-flow__edge-path {
      stroke: #3b82f6 !important;
      stroke-width: 3px !important;
    }
    
    .react-flow__edge .react-flow__edge-path {
      cursor: pointer;
      stroke-width: 8px;
      stroke: transparent;
    }
    
    .react-flow__edge .react-flow__edge-path.react-flow__edge-interaction {
      stroke-width: 12px !important;
    }
    
    /* Connection dragging styles */
    .react-flow__handle {
      transition: box-shadow 0.2s ease;
    }
    
    .react-flow__handle.connecting-mode {
      box-shadow: 0 0 10px rgba(99, 102, 241, 0.6);
    }
    
    /* Clear default styles for all custom nodes to prevent black sharp borders or covering rounded corners when selected */
    .react-flow__node {
      padding: 0 !important;
      border: none !important;
      background: transparent !important;
      box-shadow: none !important;
      outline: none !important;
    }
    
    .react-flow__node-custom,
    .react-flow__node-data,
    .react-flow__node-prompt,
    .react-flow__node-output {
      padding: 0 !important;
      border: none !important;
      border-radius: 0.75rem !important; /* Match tailwind's rounded-xl */
      background: transparent !important;
      box-shadow: none !important;
    }

    .react-flow__node-custom.selected,
    .react-flow__node-data.selected,
    .react-flow__node-prompt.selected,
    .react-flow__node-output.selected,
    .react-flow__node.selected,
    .react-flow__node.selectable.selected,
    .react-flow__node:focus,
    .react-flow__node:focus-visible,
    .react-flow__node.selectable:focus,
    .react-flow__node.selectable:focus-visible,
    .react-flow__node-output.selectable.selected,
    .react-flow__node-output.selectable:focus,
    .react-flow__node-output.selectable:focus-visible,
    .react-flow__node-data.selectable.selected,
    .react-flow__node-data.selectable:focus,
    .react-flow__node-data.selectable:focus-visible,
    .react-flow__node-prompt.selectable.selected,
    .react-flow__node-prompt.selectable:focus,
    .react-flow__node-prompt.selectable:focus-visible {
      box-shadow: none !important;
      outline: none !important;
      border: none !important;
    }
  `;

  if (typeof document !== 'undefined') {
    let styleElement = document.getElementById('canvas-custom-styles');
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = 'canvas-custom-styles';
      document.head.appendChild(styleElement);
    }
    styleElement.textContent = canvasStyles;
  }
};
