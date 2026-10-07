"""Export the verified synthetic UI sample; never export a real person's PDF."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from PIL import Image
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
image = ROOT / 'output/pdf/七模块数据总览-原文补齐样例.jpg'
output = ROOT / 'output/pdf/齐论AI-七模块数据总览-原文补齐样例.pdf'
pdfmetrics.registerFont(TTFont('SampleCJK', '/System/Library/Fonts/STHeiti Light.ttc', subfontIndex=0))
iw, ih = Image.open(image).size
width, margin, header = 700, 18, 46
height = (width - margin * 2) / iw * ih + margin + header
doc = canvas.Canvas(str(output), pagesize=(width, height))
doc.setTitle('齐论AI 七模块数据总览 原文补齐样例')
doc.setAuthor('齐论AI')
doc.setFont('SampleCJK', 12)
doc.drawString(margin, height - 20, '七模块数据总览 · 原版短文案补齐样例')
doc.setFont('SampleCJK', 8)
doc.setFillColorRGB(.4, .4, .4)
doc.drawString(margin, height - 35, '虚构答卷演示，不是黄非红真实测评结果。28项能力为反推估计，尚不保证原版全同。')
doc.drawImage(str(image), margin, margin, width=width - margin * 2, height=(width - margin * 2) / iw * ih)
doc.showPage()
doc.save()
assert len(PdfReader(output).pages) == 1
assert '虚构答卷演示' in PdfReader(output).pages[0].extract_text()
print(output)
