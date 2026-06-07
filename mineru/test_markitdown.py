from markitdown import MarkItDown

def main():
    input_path = "/Users/huihui/Brainhole_Demo_Vault/03_资料库/研报/劳动能力鉴定 职工工伤与职业病致残等级 16180-2014-gbt-e-300.pdf"
    
    print(f"[MarkItDown] Parsing: {input_path}")
    
    md = MarkItDown()
    result = md.convert(input_path)
    
    output_path = "/tmp/test_markitdown.md"
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(result.text_content)
    
    print(f"[MarkItDown] Output written to: {output_path}")
    print(f"[MarkItDown] Total chars: {len(result.text_content)}")
    print(f"\n--- First 500 chars ---")
    print(result.text_content[:500])
    print(f"\n--- Chars 3000-3500 ---")
    print(result.text_content[3000:3500])
    print(f"\n--- Last 500 chars ---")
    print(result.text_content[-500:])

if __name__ == "__main__":
    main()
