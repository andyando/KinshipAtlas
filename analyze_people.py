#!/usr/bin/env python3

import json
import os
from pathlib import Path

# Load the JSON file to understand what people are in the system
json_path = "G:/Kinship Atlas - Copy/tree-app/kinship-selections.json"
with open(json_path, 'r') as f:
    data = json.load(f)

print("Analyzing kinship-selections.json...")

# Extract person IDs from the primary-person entries
person_entries = []
for key in data['selections']:
    if 'primary-person' in key and 'Ancestry_01112026.ged' in key:
        person_data = data['selections'][key]
        person_entries.append(person_data)

print(f"Found {len(person_entries)} person entries")

# Extract all IDs from the JSON file
all_ids = set()
for key, value in data['selections'].items():
    if isinstance(value, dict) and 'id' in value:
        # This is a person entry with ID
        all_ids.add(value['id'])
    elif isinstance(value, dict) and 'I1' in value:  # Additional media entries
        for id_key in value.keys():
            if id_key.startswith('I'):
                all_ids.add(id_key)

print(f"Total unique IDs found: {len(all_ids)}")

# Get the list of existing folders to understand what's already there
media_dir = "G:/Kinship Atlas - Copy/tree-app/Primary Media Library/Ancestry_01112026_media"
existing_folders = []
if os.path.exists(media_dir):
    for item in os.listdir(media_dir):
        item_path = os.path.join(media_dir, item)
        if os.path.isdir(item_path):
            # Extract person ID from folder name
            folder_name = item
            # Look for the pattern: "First Last (birthYear-deathYear) [I####]"
            if ' [' in folder_name:
                id_part = folder_name.split(' [')[1].rstrip(']')
                if id_part.startswith('I'):
                    existing_folders.append(id_part)
            
print(f"Existing folders with IDs: {len(existing_folders)}")

# Get all person entries that have media files
media_entries = []
for key, value in data['selections'].items():
    if 'primary-media' in key and isinstance(value, dict):
        # This is a media entry - check for I### keys
        for id_key, file_path in value.items():
            if id_key.startswith('I') and isinstance(file_path, str) and file_path:
                media_entries.append((id_key, file_path))

print(f"Media entries found: {len(media_entries)}")

# Now let's create a mapping of person IDs to names
person_id_to_name = {}
for key in data['selections']:
    if 'primary-person' in key and 'Ancestry_01112026.ged' in key:
        person_data = data['selections'][key]
        if 'id' in person_data and 'name' in person_data:
            person_id_to_name[person_data['id']] = person_data['name']

print("Person ID to Name mapping:")
for id_key, name in list(person_id_to_name.items())[:10]:
    print(f"  {id_key}: {name}")

# Create a set of all IDs that should have folders
all_person_ids = set()
for key in data['selections']:
    if 'primary-person' in key and 'Ancestry_01112026.ged' in key:
        person_data = data['selections'][key]
        if 'id' in person_data:
            all_person_ids.add(person_data['id'])

print(f"\nTotal persons in system: {len(all_person_ids)}")
print("Sample IDs:", list(all_person_ids)[:10])

# Check what folders already exist
existing_folders_set = set(existing_folders)
print(f"Existing folders (from folder names): {len(existing_folders_set)}")

# Identify which people don't have media folders yet
missing_persons = all_person_ids - existing_folders_set

print(f"People missing media folders: {len(missing_persons)}")
if missing_persons:
    print("Missing IDs:", list(missing_persons)[:10])

# Now let's create the required folder structure for people without folders
base_media_dir = "G:/Kinship Atlas - Copy/tree-app/Primary Media Library/Ancestry_01112026_media"
print(f"\nCreating media folders for missing persons...")

# Create a mapping of person IDs to their names (to get proper folder naming)
person_id_to_name_map = {}
for key in data['selections']:
    if 'primary-person' in key and 'Ancestry_01112026.ged' in key:
        person_data = data['selections'][key]
        if 'id' in person_data and 'name' in person_data:
            person_id_to_name_map[person_data['id']] = person_data['name']

# Create a mapping of existing folder names to their IDs
folder_id_mapping = {}
for item in os.listdir(base_media_dir):
    item_path = os.path.join(base_media_dir, item)
    if os.path.isdir(item_path) and ' [' in item:
        id_part = item.split(' [')[1].rstrip(']')
        if id_part.startswith('I'):
            folder_id_mapping[item] = id_part

print(f"Folder ID mapping: {len(folder_id_mapping)} entries")

# Create a script to generate new folders
print("\nGenerating folder creation commands...")