#!/usr/bin/env python3

import json
import os
import re
from pathlib import Path

def get_existing_media_folders(media_dir):
    """Get all existing media folders with their IDs"""
    existing_folders = set()
    
    if not os.path.exists(media_dir):
        return existing_folders
    
    # Look for directories in the Ancestry_01112026_media folder
    ancestry_dir = os.path.join(media_dir, "Ancestry_01112026_media")
    if os.path.exists(ancestry_dir):
        for item in os.listdir(ancestry_dir):
            item_path = os.path.join(ancestry_dir, item)
            if os.path.isdir(item_path):
                # Extract ID from folder name: "First Last (birthYear-deathYear) [I####]"
                if ' [' in item:
                    id_part = item.split(' [')[1].rstrip(']')
                    if id_part.startswith('I') and re.match(r'I\d+', id_part):
                        existing_folders.add(id_part)
    
    return existing_folders

def extract_person_ids_from_json(json_path):
    """Extract all person IDs from the kinship-selections.json file"""
    with open(json_path, 'r') as f:
        data = json.load(f)
    
    # Look for primary-person entries
    person_ids = set()
    
    for key, value in data['selections'].items():
        if 'primary-person' in key and isinstance(value, dict):
            if 'id' in value:
                person_ids.add(value['id'])
    
    return person_ids

def get_person_name_from_json(json_path, person_id):
    """Get the name for a specific person ID"""
    with open(json_path, 'r') as f:
        data = json.load(f)
    
    # Look for primary-person entries
    for key, value in data['selections'].items():
        if 'primary-person' in key and isinstance(value, dict):
            if 'id' in value and value['id'] == person_id:
                return value.get('name', f"Unknown Person {person_id}")
    
    return f"Unknown Person {person_id}"

def create_folder_name(name, person_id):
    """Create the proper folder name following the pattern:
       "First Last (birthYear-deathYear) [I####]"
    """
    # Extract first and last name from full name
    parts = name.split()
    if len(parts) >= 2:
        first_name = parts[0]
        last_name = parts[-1]  # Last part is usually the surname
        
        # For now, we'll use "unknown" for birth/death years since they're not in JSON
        return f"{first_name} {last_name} (unknown-unknown) [I{person_id}]"
    else:
        return f"Unknown Person (unknown-unknown) [I{person_id}]"

def main():
    json_path = "G:/Kinship Atlas - Copy/tree-app/kinship-selections.json"
    media_dir = "G:/Kinship Atlas - Copy/tree-app/Primary Media Library"
    
    print("Analyzing existing folders...")
    existing_folders = get_existing_media_folders(media_dir)
    print(f"Found {len(existing_folders)} existing media folders")
    
    print("\nAnalyzing person data from JSON...")
    person_ids = extract_person_ids_from_json(json_path)
    print(f"Found {len(person_ids)} persons in JSON")
    
    # Identify missing people
    missing_people = person_ids - existing_folders
    print(f"People without media folders: {len(missing_people)}")
    
    if not missing_people:
        print("All persons already have media folders!")
        return
    
    print("\nMissing persons:")
    for person_id in sorted(missing_people):
        name = get_person_name_from_json(json_path, person_id)
        print(f"  {person_id}: {name}")
        
        # Create the folder
        folder_name = create_folder_name(name, person_id)
        ancestry_media_dir = os.path.join(media_dir, "Ancestry_01112026_media")
        full_folder_path = os.path.join(ancestry_media_dir, folder_name)
        
        print(f"  Creating folder: {folder_name}")
        
        try:
            if not os.path.exists(full_folder_path):
                os.makedirs(full_folder_path)
                print(f"    ✓ Created: {full_folder_path}")
            else:
                print(f"    ✗ Already exists: {full_folder_path}")
        except Exception as e:
            print(f"    ✗ Error creating folder: {e}")

if __name__ == "__main__":
    main()