import { chartData, formatMilliseconds, type FlightReport } from './report';

/** Fixed layout, system fonts and numeric session data only; no external assets or personal data. */
export function reportSvg(report: FlightReport): string {
  const chart = chartData(report.attempts);
  const ms = (value: number) => `${formatMilliseconds(value)} ms`;
  const ticks = chart.ticks.map(value => {
    const x = 200 + value / chart.maximum * 650;
    return `<path d="M${x} 485V825" stroke="#334552"/><text x="${x}" y="465" text-anchor="middle" fill="#a1b6c3" font-size="20">${value}</text>`;
  }).join('');
  const bars = chart.trials.map(({ trial, value, fraction, penalty, label }) => {
    const y = 510 + (trial - 1) * 64;
    return `<text x="64" y="${y + 27}" fill="#cbd5e1" font-size="20">Attempt ${trial}</text><rect data-trial="${trial}" data-penalty="${penalty}" x="200" y="${y}" width="${fraction * 650}" height="32" rx="3" fill="${penalty ? '#fbbf24' : '#78d9e3'}"/><text x="1136" y="${y + 27}" text-anchor="end" fill="#edf2f5" font-size="20">${ms(value)}${penalty ? ' penalty' : ' measured'}</text><text x="200" y="${y + 51}" fill="#a1b6c3" font-size="16">${label}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1000" viewBox="0 0 1200 1000">
  <rect width="1200" height="1000" fill="#080f17"/>
  <g font-family="Arial, Helvetica, sans-serif">
    <path d="M64 108H1136" stroke="#334552"/>
    <text x="64" y="73" fill="#78d9e3" font-size="28" font-weight="700" letter-spacing="5">PILOT REFLEX</text>
    <text x="1136" y="73" text-anchor="end" fill="#a1b6c3" font-size="18" letter-spacing="2">VISUAL REACTION / 01</text>
    <text x="64" y="164" fill="#edf2f5" font-size="36">Flight Performance Report</text>
    <text x="64" y="224" fill="#a1b6c3" font-size="18" letter-spacing="2">COMPETITIVE GAME SCORE</text>
    <text x="60" y="321" fill="#78d9e3" font-size="90" font-weight="700">${ms(report.score)}</text>
    <text x="650" y="231" fill="#a1b6c3" font-size="18">FASTEST VALID REACTION</text>
    <text x="650" y="278" fill="#edf2f5" font-size="32">${report.fastest === null ? 'No valid reactions' : ms(report.fastest)}</text>
    <text x="650" y="326" fill="#cbd5e1" font-size="20">Successes: ${report.successfulReactions} / False starts: ${report.falseStarts} / Timeouts: ${report.timeouts}</text>
    <path d="M64 368H1136" stroke="#334552"/>
    <text x="64" y="413" fill="#edf2f5" font-size="24">Five attempt outcomes</text>
    <text x="1136" y="413" text-anchor="end" fill="#a1b6c3" font-size="20">Score (ms) · cyan: measured / amber: penalty</text>
    ${ticks}${bars}
    <text x="64" y="854" fill="#a1b6c3" font-size="18">Score: median of all five attempts, including 3,000 ms penalties. Lower is better.</text><path d="M64 880H1136" stroke="#334552"/>
    <text x="64" y="919" fill="#a1b6c3" font-size="21">For entertainment and education only.</text>
    <text x="64" y="954" fill="#a1b6c3" font-size="21">Not an official aviation aptitude or medical assessment.</text>
  </g></svg>`;
}

export async function generateReportPng(report: FlightReport): Promise<Blob> {
  const source = URL.createObjectURL(new Blob([reportSvg(report)], { type: 'image/svg+xml' }));
  const image = new Image();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<Blob>((resolve, reject) => {
      timeout = setTimeout(() => reject(new Error('Image generation timed out. Please try again.')), 10000);
      image.onerror = () => reject(new Error('The results image could not be rendered. Please try again.'));
      image.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 1200; canvas.height = 1000;
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Image export is not supported in this browser.');
          context.drawImage(image, 0, 0);
          canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG generation failed. Please try again.')), 'image/png');
        } catch (error) { reject(error); }
      };
      image.src = source;
    });
  } finally {
    clearTimeout(timeout);
    image.onload = null; image.onerror = null;
    URL.revokeObjectURL(source);
  }
}
