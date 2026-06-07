export const TEXT_FILE_EXTENSIONS = ['txt', 'md', 'json', 'log'];
export const TABLE_FILE_EXTENSIONS = ['csv', 'xlsx', 'xls'];
export const IMAGE_FILE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'];
export const VIDEO_FILE_EXTENSIONS = ['mp4', 'webm', 'mov', 'ogg', 'avi', 'mkv', 'wmv', 'flv'];
export const AUDIO_FILE_EXTENSIONS = ['mp3', 'wav', 'm4a', 'flac', 'aac', 'wma'];
export const GRAPH_FILE_EXTENSIONS = ['graph'];
export const DOCUMENT_FILE_EXTENSIONS = ['pdf', 'docx', 'doc', 'pptx', 'ppt', 'rtf', 'epub', 'html', 'htm', 'xml', 'yaml', 'yml'];

export const MEDIA_FILE_EXTENSIONS = [...IMAGE_FILE_EXTENSIONS, ...VIDEO_FILE_EXTENSIONS, ...AUDIO_FILE_EXTENSIONS];
export const AUDIO_VIDEO_FILE_EXTENSIONS = [...VIDEO_FILE_EXTENSIONS, ...AUDIO_FILE_EXTENSIONS];

const ALL_EXTENSIONS = [
  'canvas',
  ...TEXT_FILE_EXTENSIONS,
  ...TABLE_FILE_EXTENSIONS,
  ...DOCUMENT_FILE_EXTENSIONS,
  ...GRAPH_FILE_EXTENSIONS,
  ...MEDIA_FILE_EXTENSIONS
];

export const ALL_KNOWN_EXTENSIONS_REGEX = new RegExp(`\\.(${ALL_EXTENSIONS.join('|')})$`, 'i');
