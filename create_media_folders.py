#!/usr/bin/env python3

import json
import os
import re
from pathlib import Path

def extract_person_ids_from_json(json_path):
    """Extract all person IDs from the kinship-selections.json file"""
    with open(json_path, 'r') as f:
        data = json.load(f)
    
    # Look for person entries in the selections
    person_ids = set()
    
    # Check for primary-person entries
    for key, value in data['selections'].items():
        if 'primary-person' in key and isinstance(value, dict):
            if 'id' in value:
                person_ids.add(value['id'])
    
    return person_ids

def get_existing_media_folders(media_dir):
    """Get all existing media folders with their IDs"""
    existing_folders = set()
    
    if not os.path.exists(media_dir):
        return existing_folders
    
    for item in os.listdir(media_dir):
        item_path = os.path.join(media_dir, item)
        if os.path.isdir(item_path):
            # Extract ID from folder name: "First Last (birthYear-deathYear) [I####]"
            if ' [' in item:
                id_part = item.split(' [')[1].rstrip(']')
                if id_part.startswith('I') and id_part.isdigit():
                    existing_folders.add(id_part)
    
    return existing_folders

def create_person_folder_name(name, birth_year=None, death_year=None, person_id=None):
    """Create the proper folder name following the pattern:
       "First Last (birthYear-deathYear) [I####]"
    """
    # Extract first and last name from full name
    parts = name.split()
    if len(parts) >= 2:
        first_name = parts[0]
        last_name = parts[-1]  # Last part is usually the surname
        
        # Handle names with hyphens or special characters
        if '(' in name and ')' in name:
            # Extract from existing pattern if it exists
            pass
            
        # If we have birth/death years, use them; otherwise use "unknown"
        if birth_year is None:
            birth_year = "unknown"
        else:
            birth_year = str(birth_year)
            
        if death_year is None:
            death_year = "unknown" 
        else:
            death_year = str(death_year)
        
        # Create the folder name
        return f"{first_name} {last_name} ({birth_year}-{death_year}) [I{person_id}]"
    else:
        # Fallback for names that don't follow expected pattern
        return f"Unknown Person ({birth_year}-{death_year}) [I{person_id}]"

def get_person_data_from_json(json_path):
    """Get person name and ID mapping from JSON"""
    with open(json_path, 'r') as f:
        data = json.load(f)
    
    # Create a mapping of IDs to names
    id_to_name_map = {}
    
    for key, value in data['selections'].items():
        if 'primary-person' in key and isinstance(value, dict):
            if 'id' in value and 'name' in value:
                person_id = value['id']
                name = value['name']
                id_to_name_map[person_id] = name
    
    return id_to_name_map

def create_missing_folders():
    """Create media folders for people who don't have them yet"""
    
    json_path = "G:/Kinship Atlas - Copy/tree-app/kinship-selections.json"
    base_media_dir = "G:/Kinship Atlas - Copy/tree-app/Primary Media Library/Ancestry_01112026_media"
    
    # Get all person IDs from the JSON
    person_ids = extract_person_ids_from_json(json_path)
    print(f"Found {len(person_ids)} persons in JSON")
    
    # Get existing folders 
    existing_folders = get_existing_media_folders(base_media_dir)
    print(f"Found {len(existing_folders)} existing media folders")
    
    # Identify missing people
    missing_people = person_ids - existing_folders
    print(f"People without media folders: {len(missing_people)}")
    
    if not missing_people:
        print("All persons already have media folders!")
        return
    
    # Get the mapping of IDs to names
    id_to_name_map = get_person_data_from_json(json_path)
    
    # Create a unique number for new folders (this is just an example - in real usage you'd want 
    # to generate proper unique numbers based on existing patterns or use a counter)
    print("\nCreating missing media folders...")
    
    # For demonstration, let's create the folder structure
    count = 0
    for person_id in sorted(missing_people):
        if person_id in id_to_name_map:
            name = id_to_name_map[person_id]
            
            # Create a unique ID (this is just an example - you'd want to generate proper IDs)
            # For now, we'll use the existing ID but create a folder with it
            print(f"Creating folder for: {name} ({person_id})")
            
            # The naming convention is "First Last (birthYear-deathYear) [I####]"
            # Since we don't have birth/death years in this data, we'll use placeholders
            folder_name = create_person_folder_name(name, "unknown", "unknown", person_id)
            folder_path = os.path.join(base_media_dir, folder_name)
            
            try:
                if not os.path.exists(folder_path):
                    os.makedirs(folder_path)
                    print(f"  Created: {folder_name}")
                else:
                    print(f"  Already exists: {folder_name}")
            except Exception as e:
                print(f"  Error creating {folder_name}: {e}")
            
            count += 1
            if count > 20:  # Limit for testing
                break
    
    print("\nFolder creation complete!")

if __name__ == "__main__":
    create_missing_folders()