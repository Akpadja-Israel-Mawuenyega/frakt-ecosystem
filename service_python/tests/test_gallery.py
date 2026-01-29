import pytest
from core.generator import generate_svg_from_template


def test_create_professional_dashboard():
    # Template 1: Line Chart with Data Points and Axis
    line_chart_template = """
data = params.get('data', [10, 30, 20, 50, 40, 80])
points = ""
labels = ""
for i, val in enumerate(data):
    x = 40 + (i * 60)
    y = 160 - (val * 1.5)
    points += f"{x},{y} "
    # Add small data point circles and labels
    labels += f'<circle cx="{x}" cy="{y}" r="4" fill="#007bff"/>'
    labels += f'<text x="{x-10}" y="{y-10}" font-size="10" fill="#666">{val}</text>'

svg_output = f'''
<svg width="400" height="200" xmlns="http://www.w3.org/2000/svg">
    <line x1="40" y1="160" x2="380" y2="160" stroke="#ccc" stroke-width="2"/>
    <line x1="40" y1="160" x2="40" y2="20" stroke="#ccc" stroke-width="2"/>
    <polyline points="{points}" fill="none" stroke="#007bff" stroke-width="3" stroke-linejoin="round"/>
    {labels}
    <text x="200" y="190" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#333">Time Interval (Calculated)</text>
</svg>'''
    """

    # Template 2: Professional Bar Chart with Labels
    bar_chart_template = """
data = params.get('data', [40, 70, 55, 90])
colors = ['#4e73df', '#1cc88a', '#36b9cc', '#f6c23e']
bars = ""
for i, val in enumerate(data):
    x = 50 + (i * 70)
    h = val * 1.5
    bars += f'<rect x="{x}" y="{160-h}" width="40" height="{h}" fill="{colors[i % 4]}" rx="4"/>'
    bars += f'<text x="{x+20}" y="180" text-anchor="middle" font-size="12" fill="#666">Q{i+1}</text>'

svg_output = f'''
<svg width="400" height="200" xmlns="http://www.w3.org/2000/svg">
    <line x1="40" y1="160" x2="350" y2="160" stroke="#eee" stroke-width="2"/>
    {bars}
</svg>'''
    """

    html_wrapper = """
    <html>
    <head>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f8f9fc; padding: 40px; color: #5a5c69; }
            .grid { display: flex; gap: 20px; flex-wrap: wrap; }
            .card { background: white; border: 1px solid #e3e6f0; border-radius: 12px; padding: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
            h2 { border-bottom: 2px solid #4e73df; padding-bottom: 10px; margin-bottom: 20px; font-size: 1.2rem; }
            .meta { font-size: 11px; color: #999; margin-top: 10px; }
        </style>
    </head>
    <body>
        <h1> Frakt AI: Production Primitive Gallery</h1>
        <div class="grid">
            <div class="card"><h2>Predictive Trend Analysis</h2>[CHART1]<div class="meta">Rendered via ACL Sandbox in ~0.4s</div></div>
            <div class="card"><h2>Quarterly Revenue Projection</h2>[CHART2]<div class="meta">Resolution Independent SVG</div></div>
        </div>
    </body>
    </html>
    """

    # Execute and Inject
    res1 = generate_svg_from_template(
        line_chart_template, {"data": [20, 50, 35, 90, 70, 100]}, {}
    )
    res2 = generate_svg_from_template(
        bar_chart_template, {"data": [60, 85, 40, 95]}, {}
    )

    final_html = html_wrapper.replace("[CHART1]", res1).replace("[CHART2]", res2)

    with open("dashboard.html", "w") as f:
        f.write(final_html)
    print("\n Professional Dashboard created: dashboard.html")
