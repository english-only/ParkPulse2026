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

const lgaData = JSON.parse(fs.readFileSync(lgaFile, 'utf8'));
const councils = new Map();

// Print first feature for debugging
console.log('First feature properties:', lgaData.features[0].properties);

// Extract councils from features
lgaData.features.forEach((feature) => {
  const props = feature.properties;

  // Try to find council name in various possible fields
  const possibleNames = [
    props.name,
    props[`NSW_LGA__2`],
    props.NSW_LGA__2,
    props.council,
    props.LGA_Name,
    props.LGAName,
    props.LGA
  ];

  let councilName = possibleNames.find(name => name && name !== 'null' && name.trim() !== '');

  if (!councilName) {
    // Use QUI schema or other known fields
    if (props.QUI && props.QUI.length > 0) {
      councilName = props.QUI[0];
    } else {
      councilName = `LGA-${feature.id}`;
    }
  }

  const councilId = `lga-${councils.size + 1}`;
  const lgaId = councilName.toLowerCase().replace(/\s+/g, '-');

  if (!councils.has(councilName)) {
    councils.set(councilName, {
      id: councilId,
      lga_id: lgaId,
      name: councilName,
      geometry: feature.geometry,
      file_prefix: councilName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-'),
      priority: null
    });
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
councils.forEach((council) => {
  const priorityIndex = priorityCouncils.findIndex((pc) =>
    council.name.includes(pc) || pc.includes(council.name)
  );

  if (priorityIndex !== -1) {
    councils.get(council.name).priority = ['PRIORITY', 'COMPLETED', 'IN_PROGRESS'][priorityIndex] || 'PRIORITY';
  }
});

const councilList = Array.from(councils.values()).sort((a, b) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
);

const output = {
  total_councils: councilList.length,
  councils: councilList,
  summary: {
    priority_councils: councilList.filter((c) => c.priority === 'PRIORITY').length,
    completed_councils: councilList.filter((c) => c.priority === 'COMPLETED').length,
    in_progress_councils: councilList.filter((c) => c.priority === 'IN_PROGRESS').length
  }
};

fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
console.log(`✅ Created council mapping with ${output.total_councils} councils`);
console.log(`📊 Summary: Priorities: ${output.summary.priority_councils}, Completed: ${output.summary.completed_councils}, In Progress: ${output.summary.in_progress_councils}`);