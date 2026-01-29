import pytest
from pathlib import Path
from core.generator import generate_svg_from_template
from core.ai_engine import PredictiveEngine


def test_create_professional_dashboard():
    historical_data = [73, 45, 62, 89, 34, 56, 91, 23, 78, 41, 67, 55, 82, 29, 94]

    # AI Forecast data (Projecting 10 points into the future)
    ai_response = PredictiveEngine.get_trend(historical_data)
    forecast_data = ai_response["forecast"]
    confidence = round(ai_response.get("confidence", 0) * 100, 1)

    # Calculate Status
    trend_direction = "UPWARD" if forecast_data[-1] > forecast_data[0] else "DOWNWARD"
    status_color = "#1cc88a" if trend_direction == "UPWARD" else "#e74a3b"

    # --- 2. THE TEMPLATE ---
    line_chart_template = """
data = params.get('data', [])
color = params.get('color', '#007bff')
label_prefix = params.get('label_prefix', 'P')
points = ""
markers = ""

# Dynamic scaling based on data length
total = len(data)
spacing = 340 / (total - 1) if total > 1 else 0

for i, val in enumerate(data):
    x = 40 + (i * spacing)
    y = 160 - (val * 1.2)
    points += f"{x},{y} "
    
    # Add data markers and value labels
    markers += f'<circle cx="{x}" cy="{y}" r="3.5" fill="white" stroke="{color}" stroke-width="2"/>'
    if i % 2 == 0: # Label every other point to prevent crowding
        markers += f'<text x="{x}" y="{y-12}" text-anchor="middle" font-size="10" font-weight="bold" fill="{color}">{val}</text>'
        markers += f'<text x="{x}" y="180" text-anchor="middle" font-size="9" fill="#a0a0a0">{label_prefix}{i+1}</text>'

svg_output = f'''
<svg width="400" height="200" xmlns="http://www.w3.org/2000/svg">
    <line x1="40" y1="40" x2="380" y2="40" stroke="#f0f0f0" stroke-width="1"/>
    <line x1="40" y1="100" x2="380" y2="100" stroke="#f0f0f0" stroke-width="1"/>
    
    <line x1="40" y1="160" x2="380" y2="160" stroke="#d1d3e2" stroke-width="2" stroke-linecap="round"/>
    <line x1="40" y1="160" x2="40" y2="20" stroke="#d1d3e2" stroke-width="2" stroke-linecap="round"/>
    
    <polyline points="{points}" fill="none" stroke="{color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
    {markers}
</svg>'''
    """

    html_wrapper = """
    <html>
    <head>
        <style>
            body {{ font-family: 'Segoe UI', Tahoma, sans-serif; background: #f4f7f6; padding: 40px; color: #2d3436; }}
            .container {{ max-width: 1000px; margin: auto; }}
            .header {{ display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }}
            .grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 25px; }}
            .card {{ background: white; border-radius: 15px; padding: 25px; box-shadow: 0 10px 20px rgba(0,0,0,0.05); border: 1px solid #edf2f7; }}
            .badge {{ padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; text-transform: uppercase; }}
            .badge-blue {{ background: #e1f0ff; color: #4e73df; }}
            .badge-gold {{ background: #fff9db; color: #f6c23e; }}
            .status {{ font-size: 14px; margin-top: 15px; display: flex; align-items: center; gap: 8px; }}
            h2 {{ margin: 0 0 20px 0; font-size: 1.1rem; display: flex; justify-content: space-between; }}
            .trend-up {{ color: #1cc88a; }}
            .trend-down {{ color: #e74a3b; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Frakt Intelligence Portal</h1>
                <span class="badge badge-blue">System Active</span>
            </div>
            <div class="grid">
                <div class="card">
                    <h2>Recorded Performance <span class="badge badge-blue">Historical</span></h2>
                    [CHART_HIST]
                    <div class="status">● <span style="color:#636e72">Source: Production Database v2.4</span></div>
                </div>
                <div class="card">
                    <h2>Market Forecast <span class="badge badge-gold">AI Projected</span></h2>
                    [CHART_PRED]
                    <div class="status">
                        Trend: <strong class="trend-{dir_class}">{direction}</strong> 
                        | Confidence: <strong>{conf}%</strong>
                    </div>
                </div>
            </div>
        </div>
    </body>
    </html>
    """

    # --- 3. EXECUTION ---
    res_hist = generate_svg_from_template(
        line_chart_template,
        {"data": historical_data, "color": "#4e73df", "label_prefix": "T"},
        {},
    )
    res_pred = generate_svg_from_template(
        line_chart_template,
        {"data": forecast_data, "color": "#f6c23e", "label_prefix": "F"},
        {},
    )

    final_html = (
        html_wrapper.format(
            direction=trend_direction,
            dir_class=trend_direction.lower(),
            conf=confidence,
        )
        .replace("[CHART_HIST]", res_hist)
        .replace("[CHART_PRED]", res_pred)
    )

    current_dir = Path(__file__).parent
    output_dir = (current_dir / "output").resolve()
    output_dir.mkdir(exist_ok=True)

    output_path = output_dir / "test_dashboard.html"

    output_path.write_text(final_html, encoding="utf-8")
    print("\n✅ Enhanced Professional Dashboard created: dashboard.html")


if __name__ == "__main__":
    test_create_professional_dashboard()
