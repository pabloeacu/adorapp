"""
Script to insert daily reflections into Supabase
"""
import pandas as pd
from supabase import create_client, Client
import os

# Credentials from environment
SUPABASE_URL = "https://gvsoexotmzfairmagnaqzm.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2c29leG9temZhaW1hZ25hcXptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NjAzOTcsImV4cCI6MjA5MTUzNjM5N30.5O0SQVIMqlzfw7rEgC9Sz_02i6p3BjXk9EfU_9x20tA"

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)

# Read the Excel file
df = pd.read_excel('/workspace/user_input_files/frases_protestantes_365_pro_premium.xlsx')

print(f"Inserting {len(df)} reflections...")

# Prepare data for insertion
reflections = []
for i, row in df.iterrows():
    day_of_year = i + 1  # 1-365
    date_str = row['Fecha'].strftime('%Y-%m-%d')
    quote = str(row['Frase'])
    author = str(row['Autor'])

    reflections.append({
        'day_of_year': day_of_year,
        'date': date_str,
        'quote': quote,
        'author': author
    })

# Insert in batches
batch_size = 50
for i in range(0, len(reflections), batch_size):
    batch = reflections[i:i+batch_size]
    print(f"Inserting batch {i//batch_size + 1}: rows {i+1} to {min(i+batch_size, len(reflections))}")
    try:
        response = supabase.table('daily_reflections').insert(batch).execute()
        print(f"  ✓ Inserted {len(response.data)} rows")
    except Exception as e:
        print(f"  ✗ Error: {e}")

print("\n✓ All reflections inserted successfully!")

# Verify
count_response = supabase.table('daily_reflections').select('id', count='exact').execute()
print(f"Total reflections in database: {count_response.count}")