#!/usr/bin/env node

/**
 * Council Name Mapping Script
 * Extracts unique councils from LGAs_Sydney_and_surrounds.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const dataDir = path.join(projectRoot, 'Data');
const lgaFile = path.join(projectRoot, 'Data/LGAs_Sydney_and_surrounds.json');
const outputPath = path.join(projectRoot, 'Data/councils.json');

// Parse the LGA GeoJSON
const lgaData = JSON.parse(fs.readFileSync(lgaFile, 'utf8'));
const councils = new Map();

// Extract councils from features
lgaData.features.forEach((feature, index) => {
  // Try to find council name in various possible fields
  let councilName = feature.properties?.name
    || feature.properties?.`NSW_LGA__2`
    || feature.properties?.council
    || feature.properties?.LGA_Name
    || feature.properties?.LGAName
    || `LGA-${index + 1}`;

  if (councilName) {
    // Use the council name if available, otherwise use a sequential ID
    const councilId = `lga-${index + 1}`;

    if (!councils.has(councilName)) {
      councils.set(councilName, {
        id: councilId,
        lga_id: councilName.toLowerCase().replace(/\s+/g, '-'),
        name: councilName,
        geometry: feature.geometry,
        file_prefix: councilName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-'),
        priority: null
      });
    }
  }
});

// Map council names to priority councils
const priorityCouncils = [
  'Parramatta City',
  'Liverpool City',
  'Blacktown City',
  'Northern Beaches Council',
  'Campbelltown City',
  'Camden Council',
  'Randwick City',
  'Sydney City',
  'Inner West Council',
  'Hornsby Shire',
  'Ku-ring-gai',
  'Blacktown',
  'Bayside',
  'Canada Bay',
  'Canterbury-Bankstown',
  'Cumberland',
  'Fairfield',
  'Georges River',
  'Hawkesbury',
  'Hills Shire',
  'Hunters Hill',
  'Kogarah',
  'Lane Cove',
  'Leichhardt',
  'Liverpool',
  'Manly Council',
  'Mosman',
  'North Sydney',
  'Penrith',
  'Rockdale',
  'Strathfield',
  'Sutherland Shire',
  'Waverley',
  'Willoughby',
  'Woollahra'
];

// Set priority flags
councils.forEach(council => {
  const priorityIndex = priorityCouncils.findIndex(pc =>
    council.name.includes(pc) || pc.includes(council.name)
  );

  if (priorityIndex !== -1) {
    councils.get(council.name).priority = ['PRIORITY', 'COMPLETED', 'IN_PROGRESS'][priorityIndex] || 'PRIORITY';
  }
});

// Convert to array and sort alphabetically
const councilList = Array.from(councils.values()).sort((a, b) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
);

// Save to file
const output = {
  total_councils: councilList.length,
  councils: councilList,
  summary: {
    priority_councils: councilList.filter(c => c.priority === 'PRIORITY').length,
    completed_councils: councilList.filter(c => c.priority === 'COMPLETED').length,
    in_progress_councils: councilList.filter(c => c.priority === 'IN_PROGRESS').length
  }
};

fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
console.log(`✅ Created council mapping with ${output.total_councils} councils`);
console.log(`📊 Summary: Priorities: ${output.summary.priority_councils}, Completed: ${output.summary.completed_councils}, In Progress: ${output.summary.in_progress_councils}`);