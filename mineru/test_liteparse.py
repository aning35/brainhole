import sys
import os
from liteparse import LiteParse

def main():
    input_path = "/Users/huihui/Brainhole_Demo_Vault/03_资料库/研报/劳动能力鉴定 职工工伤与职业病致残等级 16180-2014-gbt-e-300.pdf"
    tessdata_path = "/Users/huihui/workspace/code-ws/brainhole/mineru/tessdata"
    
    # Set environment variable as fallback
    os.environ["TESSDATA_PREFIX"] = tessdata_path
    
    print(f"[LiteParse] Parsing: {input_path}")
    print(f"[LiteParse] tessdata_path: {tessdata_path}")
    print(f"[LiteParse] TESSDATA_PREFIX: {os.environ.get('TESSDATA_PREFIX')}")
    
    parser = LiteParse(
        ocr_enabled=True,
        ocr_language="chi_sim",
        tessdata_path=tessdata_path,
        num_workers=4
    )
    
    result = parser.parse(input_path)
    
    output_path = "/tmp/test_liteparse_zh.md"
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(result.text)
    
    print(f"[LiteParse] Output written to: {output_path}")
    print(f"[LiteParse] Total pages: {len(result.pages)}")
    print(f"[LiteParse] Total chars: {len(result.text)}")
    print(f"\n--- Last 500 chars ---")
    print(result.text[-500:])

if __name__ == "__main__":
    main()
