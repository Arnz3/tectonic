import type { FileItem, FileKind } from './types'

const people = ['Arno Cuyvers', 'Sofie Peeters', 'Jan Janssens', 'Lotte Maes', 'Pieter De Smet']

let seq = 0
function item(
  parentId: string | null,
  name: string,
  kind: FileKind,
  size = 0,
  daysAgo = 0,
): FileItem {
  seq += 1
  const date = new Date('2026-09-30T10:00:00Z')
  date.setUTCDate(date.getUTCDate() - daysAgo)
  date.setUTCHours(8 + (seq % 9), (seq * 7) % 60)
  return {
    id: `f${seq}`,
    parentId,
    name,
    kind,
    size,
    modified: date.toISOString(),
    modifiedBy: people[seq % people.length],
  }
}

const hr = item(null, 'HR', 'folder', 0, 2)
const finance = item(null, 'Finance', 'folder', 0, 5)
const marketing = item(null, 'Marketing', 'folder', 0, 1)
const projects = item(null, 'Projecten', 'folder', 0, 0)

const payroll = item(finance.id, 'Payroll 2026', 'folder', 0, 3)
const campaigns = item(marketing.id, 'Campagnes', 'folder', 0, 4)
const tectonic = item(projects.id, 'Tectonic', 'folder', 0, 0)

export const mockFiles: FileItem[] = [
  hr,
  finance,
  marketing,
  projects,
  payroll,
  campaigns,
  tectonic,

  item(null, 'Welkom.docx', 'word', 48_200, 30),
  item(null, 'Organigram 2026.pdf', 'pdf', 1_240_000, 12),
  item(null, 'Teamfoto.jpg', 'image', 3_400_000, 60),
  item(null, 'Notities.txt', 'text', 2_100, 1),

  item(hr.id, 'Onboarding checklist.docx', 'word', 62_000, 8),
  item(hr.id, 'Verlofaanvragen.xlsx', 'excel', 210_000, 2),
  item(hr.id, 'Arbeidsreglement.pdf', 'pdf', 890_000, 120),
  item(hr.id, 'Functioneringsgesprek template.docx', 'word', 35_000, 45),
  item(hr.id, 'Welkomstvideo.mp4', 'video', 148_000_000, 90),

  item(finance.id, 'Budget 2026.xlsx', 'excel', 540_000, 5),
  item(finance.id, 'Kwartaalrapport Q2.pptx', 'powerpoint', 6_200_000, 70),
  item(finance.id, 'Kwartaalrapport Q3.pptx', 'powerpoint', 7_100_000, 3),
  item(finance.id, 'Facturen september.zip', 'zip', 22_000_000, 1),

  item(payroll.id, 'Loonstrookjes januari.pdf', 'pdf', 2_300_000, 240),
  item(payroll.id, 'Loonstrookjes augustus.pdf', 'pdf', 2_250_000, 30),
  item(payroll.id, 'Loonstrookjes september.pdf', 'pdf', 2_280_000, 0),
  item(payroll.id, 'Sociale bijdragen.xlsx', 'excel', 180_000, 14),

  item(marketing.id, 'Brand guidelines.pdf', 'pdf', 12_400_000, 200),
  item(marketing.id, 'Logo.png', 'image', 240_000, 200),
  item(marketing.id, 'Social media planning.xlsx', 'excel', 96_000, 6),
  item(campaigns.id, 'Najaarscampagne.pptx', 'powerpoint', 18_000_000, 4),
  item(campaigns.id, 'Banner 1200x628.png', 'image', 820_000, 4),
  item(campaigns.id, 'Promo video.mp4', 'video', 96_000_000, 9),
  item(campaigns.id, 'Copy teksten.docx', 'word', 41_000, 2),

  item(tectonic.id, 'Requirements.docx', 'word', 88_000, 0),
  item(tectonic.id, 'Planning.xlsx', 'excel', 74_000, 1),
  item(tectonic.id, 'Kick-off.pptx', 'powerpoint', 4_600_000, 7),
  item(tectonic.id, 'Wireframes.pdf', 'pdf', 3_900_000, 2),
  item(tectonic.id, 'Screenshot huidige upload.png', 'image', 1_100_000, 0),
  item(projects.id, 'Projectoverzicht.xlsx', 'excel', 120_000, 10),
]
