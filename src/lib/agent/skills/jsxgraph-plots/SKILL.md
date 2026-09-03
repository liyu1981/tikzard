---
name: jsxgraph-plots
description: Recipes for drawing function graphs, data visualizations, and mathematical curves in JSXGraph — parabolas, trigonometric curves, exponentials, piecewise functions, bar charts, scatter plots. Use when the user asks for function plots, graphs of equations, or data visualization.
---

# Function Plots and Data Visualization

JSXGraph has built-in support for plotting any JavaScript function and creating data visualizations.

## Function Graphs

### Basic function
```javascript
board.create('functiongraph', [x => x * x, -3, 3], {
  strokeColor: '#2563eb',
  strokeWidth: 2
});
```

### Multiple functions
```javascript
board.create('functiongraph', [x => Math.sin(x), -Math.PI, Math.PI], {
  strokeColor: 'blue'
});
board.create('functiongraph', [x => Math.cos(x), -Math.PI, Math.PI], {
  strokeColor: 'red',
  strokeDasharray: [5, 5]
});
```

### Parametric curve
```javascript
// Lissajous curve
board.create('parametriccurve', [
  t => Math.sin(3 * t),
  t => Math.sin(2 * t),
  0, 2 * Math.PI
], { strokeColor: 'purple', strokeWidth: 2 });
```

### Polar curve
```javascript
board.create('polarcurve', [
  t => 1 + Math.cos(t),  // cardioid
  0, 2 * Math.PI
], { strokeColor: 'green' });
```

### Piecewise function
```javascript
board.create('functiongraph', [
  x => x < 0 ? -x : x * x,
  -3, 3
], { strokeColor: 'orange' });
```

## Axes and Grid

### Standard axes
```javascript
board.create('axis', [[0, 0], [1, 0]], {
  name: 'x',
  withLabel: true,
  label: { position: 'right' }
});
board.create('axis', [[0, 0], [0, 1]], {
  name: 'y',
  withLabel: true,
  label: { position: 'top' }
});
```

### Custom ticks
```javascript
board.create('axis', [[0, 0], [1, 0]], {
  ticks: { precision: 1, majorHeight: 10 }
});
```

### Grid
```javascript
board.create('grid', [], {
  gridX: 0.5,
  gridY: 0.5,
  strokeColor: '#e0e0e0'
});
```

## Data Visualization

### Scatter plot
```javascript
var data = [[0,1], [1,3], [2,2], [3,5], [4,4]];
var points = data.map(p => board.create('point', p, {
  face: 'o', size: 4, strokeColor: 'blue'
}));
```

### Bar chart
```javascript
var cats = ['A', 'B', 'C'];
var vals = [3, 5, 2];
var barWidth = 0.6;
cats.forEach((cat, i) => {
  board.create('rectangle', [
    [i - barWidth/2, 0],
    [i + barWidth/2, vals[i]]
  ], { fillColor: 'steelblue', fillOpacity: 0.7 });
  board.create('text', [i, -0.5, cat]);
});
```

### Tangent line at a point
```javascript
var f = x => x * x;
var graph = board.create('functiongraph', [f, -3, 3]);
var P = board.create('glider', [1, 1, graph], { name: 'P' });
var tangent = board.create('tangent', [P, graph], {
  strokeColor: 'red', strokeDasharray: [4, 4]
});
```

## Styling Tips

- Use `strokeColor` and `strokeWidth` for line appearance
- Use `strokeDasharray: [5, 5]` for dashed lines
- Use `fillColor` and `fillOpacity` for filled shapes
- Use `withLabel: true` or `board.create('text', ...)` for labels
- Use `name: 'label'` on elements for auto-labeling
