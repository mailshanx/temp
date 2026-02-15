import markdown
from weasyprint import HTML

with open("top-100-arbitration-users-india.md", "r") as f:
    md_content = f.read()

html_body = markdown.markdown(md_content, extensions=["tables", "toc"])

html_full = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {{
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 11px;
    line-height: 1.5;
    margin: 40px 50px;
    color: #222;
  }}
  h1 {{
    font-size: 22px;
    border-bottom: 2px solid #333;
    padding-bottom: 8px;
    margin-top: 30px;
  }}
  h2 {{
    font-size: 16px;
    color: #1a1a6e;
    border-bottom: 1px solid #ccc;
    padding-bottom: 4px;
    margin-top: 25px;
  }}
  h3 {{
    font-size: 13px;
    color: #333;
    margin-top: 15px;
  }}
  table {{
    border-collapse: collapse;
    width: 100%;
    margin: 12px 0;
    font-size: 10px;
  }}
  th, td {{
    border: 1px solid #bbb;
    padding: 5px 8px;
    text-align: left;
    vertical-align: top;
  }}
  th {{
    background-color: #e8e8f0;
    font-weight: bold;
  }}
  tr:nth-child(even) {{
    background-color: #f7f7fa;
  }}
  em {{
    color: #555;
  }}
  a {{
    color: #1a5276;
    text-decoration: none;
  }}
  hr {{
    border: none;
    border-top: 1px solid #ccc;
    margin: 20px 0;
  }}
  ol, ul {{
    margin: 8px 0;
    padding-left: 25px;
  }}
  @page {{
    size: A4;
    margin: 2cm;
  }}
</style>
</head>
<body>
{html_body}
</body>
</html>"""

HTML(string=html_full).write_pdf("top-100-arbitration-users-india.pdf")
print("PDF created: top-100-arbitration-users-india.pdf")
