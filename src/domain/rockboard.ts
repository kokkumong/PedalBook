// Dimensional facts transcribed from RockBoard's product pages and the linked
// "Area Overview Bottom Side" / "Schematic Drawing" PDFs. See docs/ROCKBOARD_3D.md.
// No manufacturer drawings, photographs or meshes are bundled here.
export type RockboardProfile = {
  name: string; slug: string; widthMm: number; depthMm: number;
  cavityDepthMm: number; cavityFrontMm: number; cavityRearMm: number; bayWidthsMm: readonly number[];
  slotRows: number; braceWidthMm: number; modCentersMm: readonly number[];
  step?: { depthMm: number; riseMm: number; cavityDepthMm: number };
  conflicts: readonly string[]; drawingUrl: string; spacesUrl: string; productUrl: string; psuUrl: string;
};
const CDN = 'https://cdn.rockboard.de/nos/data/erp/Artikell_PDF/';
const commonConflict = '제품 페이지의 높이·10° 표기와 도면이 일치하지 않아, 3D 경사는 하부 공간도면의 mm 치수로 재구성했습니다.';
type Entry = [name: string, width: number, depth: number, cavityDepth: number, cavityRear: number, bays: number[], rows: number, mods: number[]];
const entries: Entry[] = [
  ['Duo 2.0',318,142,95,40,[100,100],3,[]],
  ['Duo 2.1',470,142,95,40,[180,180],3,[]],
  ['Duo 2.2',622,142,95,40,[180,80,180],3,[]],
  ['Duo 2.3',722,142,95,40,[190,175,190],3,[]],
  ['Tres 3.0',442,236,185,55,[185,140],5,[124]],
  ['Tres 3.1',522,236,185,55,[200,200],5,[128.5]],
  ['Tres 3.2',598,236,185,55,[140,175,140],5,[299]],
  ['Tres 3.3',722,236,185,55,[190,175,190],5,[133,589]],
  ['Quad 4.1',470,330,275,68.5,[175,175],7,[124]],
  ['Quad 4.2',622,330,275,68.5,[140,175,140],7,[311]],
  ['Quad 4.3',828,330,275,68.5,[125,175,175,125],7,[300,528]],
  ['Quad 4.4',722,330,275,68.5,[190,175,190],7,[133,589]],
  ['Cinque 5.2',622,424,365,83,[140,175,140],9,[311]],
  ['Cinque 5.3',820,424,365,83,[125,175,175,125],9,[296,524]],
  ['Cinque 5.3 MAX',826,498,454,143,[125,175,175,125],10,[299,527]],
  ['Cinque 5.4',1002,424,365,83,[230,175,175,230],9,[121.5,880.5]],
];
export const ROCKBOARD_PROFILES: readonly RockboardProfile[] = entries.map(([name,widthMm,depthMm,cavityDepthMm,cavityRearMm,bayWidthsMm,slotRows,modCentersMm]) => {
  const [family,number] = name.split(' '), max = name.endsWith('MAX');
  const slug = `${family.toLowerCase()}-${number.replace('.', '')}${max ? '-max' : ''}`;
  return {
    name, slug, widthMm, depthMm, cavityDepthMm, cavityFrontMm: 25, cavityRearMm, bayWidthsMm, slotRows, braceWidthMm: 52, modCentersMm,
    ...(max ? { step: { depthMm: 218, riseMm: 46, cavityDepthMm: 175 } } : {}),
    conflicts: [commonConflict,
      ...(name === 'Tres 3.2' ? ['제품 사양은 가로 598mm, 설계 도면은 622mm로 다릅니다. 외곽은 제품 사양 598mm를 사용합니다.'] : []),
      ...(name === 'Duo 2.2' ? ['V2 하부 공간도면과 설계 도면의 보강대 간격이 다릅니다. 하부 구획은 V2 공간도면을 따릅니다.'] : []),
    ],
    drawingUrl: `${CDN}PDF_Drawing/RockBoard/Pedalboards/RBO_${number}${max ? '-MAX' : ''}_Technical-Drawing.pdf`,
    spacesUrl: `${CDN}PDF_Drawing/RockBoard/Spaces_for_all_RockBoards/RBO_B_${number}_${family.toUpperCase()}${max ? '_MAX' : ''}_spaces${name === 'Duo 2.2' ? '_V2' : ''}.pdf`,
    productUrl: `https://www.rockboard.de/en/pedalboards/${slug}/`,
    psuUrl: `${CDN}FURTHER_INFO_DOCUMENTS/RockBoard/PSU_Matrix/${family.toUpperCase()}_PSU_Matrix.pdf`,
  };
});

export function rockboardProfile(model: { brand: string; name: string } | undefined): RockboardProfile | undefined {
  if (model?.brand.toLowerCase() !== 'rockboard by warwick') return;
  return ROCKBOARD_PROFILES.find(profile => profile.name.toLowerCase() === model.name.toLowerCase());
}

// Manufacturing details without dimension callouts are explicitly illustrative.
export const ROCKBOARD_SHEET_MM = 2.5;
export const ROCKBOARD_FOOT_MM = 11;
export function rockboardAngle(profile: RockboardProfile) {
  return Math.atan((profile.cavityRearMm - profile.cavityFrontMm - (profile.step?.riseMm ?? 0)) / profile.cavityDepthMm);
}
export function rockboardBaseHeight(profile: RockboardProfile) {
  const angle = rockboardAngle(profile);
  return ROCKBOARD_FOOT_MM + ROCKBOARD_SHEET_MM / Math.cos(angle) + profile.cavityFrontMm + Math.tan(angle) * profile.cavityDepthMm / 2;
}

// Bay widths are the manufacturer's quoted spaces, not the whole unobstructed
// interior. Unspecified end offsets are centered; do not use them as drill guides.
export function rockboardBays(profile: RockboardProfile) {
  const used = profile.bayWidthsMm.reduce((a,b) => a+b, 0) + profile.braceWidthMm * (profile.bayWidthsMm.length - 1);
  let x = (profile.widthMm - used) / 2;
  return profile.bayWidthsMm.map((widthMm, index) => {
    const result = { index, xMm: x + widthMm / 2, widthMm };
    x += widthMm + profile.braceWidthMm;
    return result;
  });
}
export function rockboardBraces(profile: RockboardProfile) {
  return rockboardBays(profile).slice(0, -1).map(bay => bay.xMm + bay.widthMm / 2 + profile.braceWidthMm / 2);
}
export function rockboardSlotRuns(width: number) {
  const count = Math.ceil((width - 30 + 16) / 76);
  const end = (width - 30 - (count - 2) * 60 - (count - 1) * 16) / 2;
  const rows = [Array.from({ length: count }, (_, i) => i === 0 || i === count - 1 ? end : 60),
    Array.from({ length: count - 1 }, (_, i) => i === 0 || i === count - 2 ? end + 38 : 60)];
  return rows.map(lengths => {
    let x = 15;
    return lengths.map(length => { const run = { xMm: x + length / 2, lengthMm: length }; x += length + 16; return run; });
  });
}
