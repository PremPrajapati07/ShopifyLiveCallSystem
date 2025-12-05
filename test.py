# process_shopify_csv.py
import csv
import json
import pandas as pd
from urllib.parse import urljoin

def process_shopify_csv(csv_file_path, output_json_path, base_url="https://vaama.co/products/"):
    """
    Process Shopify CSV export and create a JSON catalog
    """
    try:
        # Read CSV file
        print(f"Reading CSV file: {csv_file_path}")
        df = pd.read_csv(csv_file_path)
        
        # Display initial info
        print(f"Total rows: {len(df)}")
        print(f"Columns: {list(df.columns)}")
        
        # Drop rows where Title is empty or NaN
        initial_count = len(df)
        df = df.dropna(subset=['Title'])
        df = df[df['Title'].astype(str).str.strip() != '']
        print(f"Rows after removing empty titles: {len(df)} (removed {initial_count - len(df)})")
        
        # Ensure required columns exist (case-insensitive)
        columns_lower = [col.lower() for col in df.columns]
        
        # Map column names (case-insensitive)
        col_mapping = {}
        for col in df.columns:
            col_lower = col.lower()
            if col_lower == 'handle':
                col_mapping['handle'] = col
            elif col_lower == 'title':
                col_mapping['title'] = col
            elif 'image' in col_lower and 'src' in col_lower:
                col_mapping['image_src'] = col
            elif col_lower == 'vendor':
                col_mapping['vendor'] = col
            elif col_lower == 'type':
                col_mapping['product_type'] = col
            elif col_lower == 'published':
                col_mapping['published'] = col
            elif col_lower == 'variant price':
                col_mapping['price'] = col
        
        # Check if handle column exists
        if 'handle' not in col_mapping:
            print("Error: 'Handle' column not found in CSV")
            print(f"Available columns: {list(df.columns)}")
            return False
        
        # Create catalog
        catalog = []
        missing_images = 0
        
        for _, row in df.iterrows():
            handle = row[col_mapping['handle']] if 'handle' in col_mapping else ''
            title = row[col_mapping['title']] if 'title' in col_mapping else ''
            
            # Skip if no handle or title
            if not handle or not title:
                continue
            
            # Get image URL
            image_url = ''
            if 'image_src' in col_mapping:
                image_url = row[col_mapping['image_src']]
                if pd.isna(image_url):
                    missing_images += 1
            
            # Get vendor
            vendor = ''
            if 'vendor' in col_mapping:
                vendor = row[col_mapping['vendor']] if not pd.isna(row[col_mapping['vendor']]) else ''
            
            # Get product type
            product_type = ''
            if 'product_type' in col_mapping:
                product_type = row[col_mapping['product_type']] if not pd.isna(row[col_mapping['product_type']]) else ''
            
            # Get price
            price = ''
            if 'price' in col_mapping:
                price = row[col_mapping['price']] if not pd.isna(row[col_mapping['price']]) else ''
            
            # Get published status
            published = True
            if 'published' in col_mapping:
                published_val = row[col_mapping['published']]
                if pd.isna(published_val):
                    published = False
                else:
                    published = str(published_val).strip().lower() in ['true', '1', 'yes']
            
            # Create product URL
            product_url = urljoin(base_url, handle.strip('/'))
            
            product = {
                'handle': str(handle).strip(),
                'title': str(title).strip(),
                'product_url': product_url,
                'image_url': str(image_url).strip() if image_url else '',
                'vendor': str(vendor).strip(),
                'product_type': str(product_type).strip(),
                'price': str(price).strip(),
                'published': published,
                'search_terms': f"{title} {vendor} {product_type} {handle}".lower()
            }
            
            catalog.append(product)
        
        print(f"Total products in catalog: {len(catalog)}")
        print(f"Products missing images: {missing_images}")
        
        # Save to JSON
        with open(output_json_path, 'w', encoding='utf-8') as f:
            json.dump({
                'metadata': {
                    'total_products': len(catalog),
                    'base_url': base_url,
                    'generated_at': pd.Timestamp.now().isoformat()
                },
                'products': catalog
            }, f, indent=2, ensure_ascii=False)
        
        print(f"✅ Catalog saved to: {output_json_path}")
        
        # Display sample products
        print("\n📋 Sample products:")
        for i, product in enumerate(catalog[:3]):
            print(f"  {i+1}. {product['title']} ({product['handle']})")
            print(f"     URL: {product['product_url']}")
            print(f"     Price: {product['price']}")
        
        return True
        
    except Exception as e:
        print(f"❌ Error processing CSV: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def main():
    # Configuration
    csv_file = r"P:\products_export_1\products_export_1.csv"  # Change this to your CSV file name
    json_output = "products_catalog.json"
    
    print("=== Shopify CSV to JSON Converter ===\n")
    
    # Process the CSV file
    success = process_shopify_csv(csv_file, json_output)
    
    if success:
        print("\n✅ Conversion completed successfully!")
    else:
        print("\n❌ Conversion failed. Please check the errors above.")

if __name__ == "__main__":
    main()