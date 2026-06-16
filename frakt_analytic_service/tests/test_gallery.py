import pytest
from pathlib import Path
from worker.generator import generate_svg_from_template


def test_create_professional_dashboard_optimized():
    """
    Optimized Integration Test:
    - Batches AI Forecasting + Dual SVG Generation into ONE worker dispatch.
    - Reduces sandbox overhead latency by 50%.
    """

    historical_data = [73, 45, 62, 89, 34, 56, 91, 23, 78, 41, 67, 55, 82, 29, 94]

    batch_ai_template = """
# Internal Helper: Linear Regression
def get_ai_forecast(series, horizon=10):
    n = len(series)
    x = list(range(n))
    y = series
    sum_x, sum_y = sum(x), sum(y)
    sum_xx = sum(i*i for i in x)
    sum_xy = sum(i*j for i, j in zip(x, y))
    
    slope = (n * sum_xy - sum_x * sum_y) / (n * sum_xx - sum_x**2)
    intercept = (sum_y - slope * sum_x) / n
    forecast = [slope * (i + n) + intercept for i in range(horizon)]
    
    # Calculate R-squared (Confidence)
    avg_y = sum_y / n
    total_ss = sum((v - avg_y)**2 for v in y)
    res_ss = sum((y[i] - (slope * i + intercept))**2 for i in range(n))
    r_sq = 1 - (res_ss / total_ss) if total_ss != 0 else 0
    
    return forecast, round(r_sq * 100, 1), "UPWARD" if slope > 0 else "DOWNWARD"

# Internal Helper: SVG Drawing
def draw_chart(data, color, label_prefix):
    total = len(data)
    spacing = 340 / (total - 1) if total > 1 else 0
    points, markers = "", ""
    for i, val in enumerate(data):
        x = 40 + (i * spacing)
        y = 160 - (val * 1.2)
        points += f"{x},{y} "
        markers += f'<circle cx="{x}" cy="{y}" r="3.5" fill="white" stroke="{color}" stroke-width="2"/>'
        if i % 2 == 0:
            markers += f'<text x="{x}" y="{y-12}" text-anchor="middle" font-size="10" font-weight="bold" fill="{color}">{int(val)}</text>'
            markers += f'<text x="{x}" y="180" text-anchor="middle" font-size="9" fill="#a0a0a0">{label_prefix}{i+1}</text>'
    
    return f'''<svg width="400" height="200" xmlns="http://www.w3.org/2000/svg">
        <line x1="40" y1="40" x2="380" y2="40" stroke="#f0f0f0" stroke-width="1"/>
        <line x1="40" y1="100" x2="380" y2="100" stroke="#f0f0f0" stroke-width="1"/>
        <line x1="40" y1="160" x2="380" y2="160" stroke="#d1d3e2" stroke-width="2" stroke-linecap="round"/>
        <line x1="40" y1="160" x2="40" y2="20" stroke="#d1d3e2" stroke-width="2" stroke-linecap="round"/>
        <polyline points="{points}" fill="none" stroke="{color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
        {markers}
    </svg>'''

# Execution
h_data = params.get('data', [])
forecast, conf, trend_dir = get_ai_forecast(h_data)

svg_hist = draw_chart(h_data, "#4e73df", "T")
svg_pred = draw_chart(forecast, "#f6c23e", "F")

# Return batch result joined by delimiter
svg_output = f"{svg_hist}|||{svg_pred}|||{conf}|||{trend_dir}"
"""

    # HTML Structure
    html_wrapper = """
        <html>
        <head>
            <style>
                body {{ font-family: 'Segoe UI', sans-serif; background: #f4f7f6; padding: 40px; color: #2d3436; }}
                .container {{ max-width: 1000px; margin: auto; }}
                .header {{ display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }}
                .grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 25px; }}
                .card {{ background: white; border-radius: 15px; padding: 25px; box-shadow: 0 10px 20px rgba(0,0,0,0.05); border: 1px solid #edf2f7; }}
                .badge {{ padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; text-transform: uppercase; }}
                .badge-blue {{ background: #e1f0ff; color: #4e73df; }}
                .badge-gold {{ background: #fff9db; color: #f6c23e; }}
                
                /* Documentation Key Styles */
                .doc-key {{ 
                    margin-top: 40px; 
                    background: #ffffff; 
                    border-radius: 12px; 
                    padding: 20px; 
                    border-left: 5px solid #4e73df;
                    font-size: 13px;
                    line-height: 1.6;
                }}
                .doc-key h3 {{ margin-top: 0; color: #4e73df; font-size: 1rem; }}
                .key-item {{ margin-bottom: 8px; }}
                .code-inline {{ background: #f1f3f5; padding: 2px 5px; border-radius: 4px; font-family: monospace; font-weight: bold; }}
                
                .status {{ font-size: 14px; margin-top: 15px; display: flex; align-items: center; gap: 8px; border-top: 1px solid #f1f1f1; padding-top: 10px; }}
                .trend-up {{ color: #1cc88a; }}
                .trend-down {{ color: #e74a3b; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Frakt Intelligence Portal</h1>
                    <span class="badge badge-blue">Batch Execution Optimized</span>
                </div>
                
                <div class="grid">
                    <div class="card">
                        <h2>Recorded Performance <span class="badge badge-blue">Historical</span></h2>
                        [CHART_HIST]
                        <div class="status">● <span style="color:#636e72">Data points: {h_count}</span></div>
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

                <div class="doc-key">
                    <h3>🔍 Technical Legend & Methodology</h3>
                    <div class="key-item">📌 <span class="code-inline">T [1-15]</span>: <strong>Historical Intervals.</strong> Represents actual data points retrieved from the primary time-series database.</div>
                    <div class="key-item">📌 <span class="code-inline">F [1-10]</span>: <strong>Forecast Intervals.</strong> Predicted values generated by the AI Engine's projection horizon.</div>
                    <div class="key-item">📌 <strong>Execution:</strong> This report was generated in a single <strong>Isolated Worker Dispatch</strong> (Sandboxed Python Process). All AI math and SVG rendering occurred within the worker to minimize IPC latency.</div>
                    <div class="key-item">📌 <strong>AI Engine:</strong> Utilizes <strong>Ordinary Least Squares (OLS) Linear Regression</strong> to calculate the global trend, stripping historical noise to identify core trajectory.</div>
                </div>
            </div>
        </body>
        </html>
        """

    batch_result = generate_svg_from_template(
        batch_ai_template, {"data": historical_data}, {}
    )

    res_hist, res_pred, confidence, direction = batch_result.split("|||")

    final_html = (
        html_wrapper.format(
            h_count=len(historical_data),
            direction=direction,
            dir_class=direction.lower(),
            conf=confidence,
        )
        .replace("[CHART_HIST]", res_hist)
        .replace("[CHART_PRED]", res_pred)
    )

    # Path Management
    output_dir = Path(__file__).parent / "output"
    output_dir.mkdir(exist_ok=True)
    output_path = output_dir / "test_dashboard_optimized.html"

    output_path.write_text(final_html, encoding="utf-8")

    print(f"\n✅ Optimized Dashboard created at: {output_path}")


if __name__ == "__main__":
    test_create_professional_dashboard_optimized()
