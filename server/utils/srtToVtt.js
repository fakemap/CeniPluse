/**
 * Converts SubRip (.srt) subtitle text into WebVTT (.vtt) format
 * so HTML5 <video><track> elements can natively render .srt files.
 */
function srtToVtt(srtText) {
  if (!srtText) return 'WEBVTT\n\n';
  const cleaned = srtText
    .replace(/^\uFEFF/, '') // Remove UTF-8 BOM if present
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Convert SRT timestamps 00:01:23,456 --> 00:01:26,789 to WebVTT 00:01:23.456 --> 00:01:26.789
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
    .trim();

  return `WEBVTT\n\n${cleaned}\n`;
}

module.exports = { srtToVtt };
