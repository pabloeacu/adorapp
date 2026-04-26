"""
Script to insert daily reflections into Supabase using REST API
"""
import pandas as pd
import requests
import json
import time

# Credentials
SUPABASE_URL = "https://gvsoexotmzfairmagnaqzm.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2c29leG9temZhaW1hZ25hcXptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NjAzOTcsImV4cCI6MjA5MTUzNjM5N30.5O0SQVIMqlzfw7rEgC9Sz_02i6p3BjXk9EfU_9x20tA"

headers = {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

# Read the Excel file
df = pd.read_excel('/workspace/user_input_files/frases_protestantes_365_pro_premium.xlsx')

print(f"Inserting {len(df)} reflections via REST API...")

# Prepare all data
reflections = []
for i, row in df.iterrows():
    day_of_year = i + 1
    date_str = row['Fecha'].strftime('%Y-%m-%d')
    quote = str(row['Frase'])
    author = str(row['Autor'])

    reflections.append({
        'day_of_year': day_of_year,
        'date': date_str,
        'quote': quote,
        'author': author
    })

# Insert using POST to /rest/v1/daily_reflections
url = f"{SUPABASE_URL}/rest/v1/daily_reflections"

print(f"POST to: {url}")
print(f"Sending {len(reflections)} rows in one request...")

try:
    response = requests.post(url, headers=headers, json=reflections)
    print(f"Status: {response.status_code}")
    if response.status_code in [200, 201]:
        print(f"✓ Successfully inserted {len(reflections)} reflections!")
        print(f"Response: {response.text[:500]}")
    else:
        print(f"Error: {response.text}")
except Exception as e:
    print(f"Error: {e}")