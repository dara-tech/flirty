/**
 * OSS (Object Storage Service) Upload Utility
 * Handles file uploads to OSS before sending URLs to backend
 */

// Get OSS API URL from environment variable
const getOSSApiURL = () => {
  // Use VITE_OSS_API_URL if set, otherwise default to production
  return import.meta.env.VITE_OSS_API_URL || 'https://file-l2-sg.sre999.com';
};

// Get API key from environment variable
const getOSSApiKey = () => {
  const apiKey = import.meta.env.VITE_OSS_API_KEY || '';
  if (!apiKey) {
    console.warn('VITE_OSS_API_KEY is not set in environment variables. Please add it to your .env file.');
  }
  return apiKey;
};

/**
 * Get upload URL from OSS API
 * @param {Array} files - Array of { filename, content_type }
 * @param {string} companyCode - Company code (default: 'sre')
 * @param {string} branchCode - Branch code (default: 'test01')
 * @param {string} uploadType - Upload type (default: 'file-upload')
 * @returns {Promise<Array>} Array of upload info with upload_url, download_url, etc.
 */
export const getOSSUploadURLs = async (files, companyCode = 'sre', branchCode = 'test01', uploadType = 'file-upload') => {
  const ossApiUrl = getOSSApiURL();
  const apiKey = getOSSApiKey();

  // Validate API key
  if (!apiKey) {
    throw new Error('OSS API key is missing. Please set VITE_OSS_API_KEY in your .env file.');
  }

  // Ensure URL doesn't end with slash
  const cleanUrl = ossApiUrl.replace(/\/$/, '');
  
  const response = await fetch(`${cleanUrl}/get-upload-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      files,
      company_code: companyCode,
      branch_code: branchCode,
      upload_type: uploadType,
    }),
  });

  if (!response.ok) {
    let errorMessage = `Failed to get upload URL: ${response.status}`;
    
    if (response.status === 401) {
      errorMessage = 'Authentication failed. Please check your VITE_OSS_API_KEY in .env file.';
    } else {
      const errorData = await response.json().catch(() => null);
      if (errorData?.error) {
        errorMessage = errorData.error;
      }
    }
    
    throw new Error(errorMessage);
  }

  const data = await response.json();
  return data.uploads || [];
};

/**
 * Upload file to OSS
 * @param {string} uploadUrl - Upload URL from getOSSUploadURLs
 * @param {Blob|File|ArrayBuffer} fileData - File data to upload
 * @param {string} contentType - Content type of the file
 * @param {Function} onProgress - Optional progress callback (percent: number) => void
 * @returns {Promise<void>}
 */
export const uploadFileToOSS = async (uploadUrl, fileData, contentType, onProgress = null) => {
  // Convert fileData to Blob/File if needed
  let file;
  if (fileData instanceof Blob || fileData instanceof File) {
    file = fileData;
  } else if (fileData instanceof ArrayBuffer) {
    file = new Blob([fileData], { type: contentType });
  } else if (typeof fileData === 'string' && fileData.startsWith('data:')) {
    // Handle data URI
    const response = await fetch(fileData);
    file = await response.blob();
  } else {
    throw new Error('Unsupported file data type');
  }

  // Use XMLHttpRequest for progress tracking, fallback to fetch if no progress needed
  if (!onProgress) {
    // Simple fetch for no progress tracking (matches test file)
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType || file.type || 'application/octet-stream'
      },
      body: file
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
    }
    return;
  }

  // Use XMLHttpRequest for progress tracking
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    // Track upload progress
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percentComplete = Math.round((e.loaded / e.total) * 100);
        onProgress(percentComplete);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Upload failed: Network error'));
    });

    xhr.addEventListener('abort', () => {
      reject(new Error('Upload aborted'));
    });

    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', contentType || file.type || 'application/octet-stream');
    xhr.send(file);
  });
};

/**
 * Upload a single file to OSS and return the download URL
 * @param {File|Blob} file - File to upload
 * @param {string} companyCode - Company code
 * @param {string} branchCode - Branch code
 * @param {string} uploadType - Upload type
 * @param {Function} onProgress - Optional progress callback
 * @returns {Promise<string>} Download URL
 */
export const uploadSingleFileToOSS = async (file, companyCode = 'sre', branchCode = 'test01', uploadType = 'file-upload', onProgress = null) => {
  // Get upload URL
  const uploadInfos = await getOSSUploadURLs(
    [{ filename: file.name || 'file', content_type: file.type || 'application/octet-stream' }],
    companyCode,
    branchCode,
    uploadType
  );

  if (uploadInfos.length === 0) {
    throw new Error('No upload URL received');
  }

  const uploadInfo = uploadInfos[0];

  // Upload file - use file.type directly (matches test file behavior)
  // uploadInfo.headers may contain Content-Type, but we use file.type as primary
  await uploadFileToOSS(
    uploadInfo.upload_url,
    file,
    file.type || uploadInfo.headers?.['Content-Type'] || 'application/octet-stream',
    onProgress
  );

  // Return download URL
  return uploadInfo.download_url;
};

/**
 * Upload multiple files to OSS and return download URLs
 * @param {Array<File|Blob>} files - Files to upload
 * @param {string} companyCode - Company code
 * @param {string} branchCode - Branch code
 * @param {string} uploadType - Upload type
 * @param {Function} onProgress - Optional progress callback (current: number, total: number) => void
 * @returns {Promise<Array<string>>} Array of download URLs
 */
export const uploadMultipleFilesToOSS = async (files, companyCode = 'sre', branchCode = 'test01', uploadType = 'file-upload', onProgress = null) => {
  // Prepare file info for upload URL request
  const fileInfos = files.map(file => ({
    filename: file.name || 'file',
    content_type: file.type || 'application/octet-stream',
  }));

  // Get upload URLs
  const uploadInfos = await getOSSUploadURLs(fileInfos, companyCode, branchCode, uploadType);

  if (uploadInfos.length !== files.length) {
    throw new Error(`Expected ${files.length} upload URLs, got ${uploadInfos.length}`);
  }

  // Upload all files
  const downloadUrls = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const uploadInfo = uploadInfos[i];

    // Track progress for this file
    let fileProgress = 0;
    const fileOnProgress = onProgress
      ? (percent) => {
          fileProgress = percent;
          // Calculate overall progress
          const overallProgress = Math.round(
            ((i * 100 + percent) / files.length)
          );
          onProgress(overallProgress, i + 1, files.length);
        }
      : null;

    // Upload file - use file.type directly (matches test file behavior)
    await uploadFileToOSS(
      uploadInfo.upload_url,
      file,
      file.type || uploadInfo.headers?.['Content-Type'] || 'application/octet-stream',
      fileOnProgress
    );

    downloadUrls.push(uploadInfo.download_url);
  }

  return downloadUrls;
};

/**
 * Convert data URI to Blob
 * @param {string} dataURI - Data URI string
 * @returns {Blob}
 */
export const dataURItoBlob = (dataURI) => {
  const byteString = atob(dataURI.split(',')[1]);
  const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mimeString });
};

/**
 * Upload data URI to OSS
 * @param {string} dataURI - Data URI string
 * @param {string} filename - Filename
 * @param {string} companyCode - Company code
 * @param {string} branchCode - Branch code
 * @param {string} uploadType - Upload type
 * @param {Function} onProgress - Optional progress callback
 * @returns {Promise<string>} Download URL
 */
export const uploadDataURIToOSS = async (dataURI, filename = 'file', companyCode = 'sre', branchCode = 'test01', uploadType = 'file-upload', onProgress = null) => {
  const blob = dataURItoBlob(dataURI);
  const file = new File([blob], filename, { type: blob.type });
  return await uploadSingleFileToOSS(file, companyCode, branchCode, uploadType, onProgress);
};

/**
 * Get signed URL for viewing/downloading a single file (V1 Compatible)
 * @param {string} fileName - File name (e.g., "2511220900001234_photo.jpg")
 * @param {string} accessType - Access type (e.g., "image-upload", "file-upload")
 * @param {string} companyCode - Company code (default: 'sre')
 * @param {string} branchCode - Branch code (default: 'test01')
 * @returns {Promise<string>} Signed URL for viewing/downloading
 */
export const getSignedURL = async (fileName, accessType = 'file-upload', companyCode = 'sre', branchCode = 'test01') => {
  const ossApiUrl = getOSSApiURL();
  const apiKey = getOSSApiKey();

  // Validate API key
  if (!apiKey) {
    throw new Error('OSS API key is missing. Please set VITE_OSS_API_KEY in your .env file.');
  }

  // Ensure URL doesn't end with slash
  const cleanUrl = ossApiUrl.replace(/\/$/, '');

  const response = await fetch(`${cleanUrl}/get-signed-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      file_name: fileName,
      access_type: accessType,
      company_code: companyCode,
      branch_code: branchCode,
    }),
  });

  if (!response.ok) {
    let errorMessage = `Failed to get signed URL: ${response.status}`;
    
    if (response.status === 401) {
      errorMessage = 'Authentication failed. Please check your VITE_OSS_API_KEY in .env file.';
    } else {
      const errorData = await response.json().catch(() => null);
      if (errorData?.error) {
        errorMessage = errorData.error;
      }
    }
    
    throw new Error(errorMessage);
  }

  const data = await response.json();
  return data.url;
};

/**
 * Get signed URLs for multiple files (each with own company/branch/type)
 * @param {Array} files - Array of { file_name, access_type, company_code, branch_code }
 * @returns {Promise<Array>} Array of { file_name, url }
 */
export const getMultiSignedURLs = async (files) => {
  const ossApiUrl = getOSSApiURL();
  const apiKey = getOSSApiKey();

  // Validate API key
  if (!apiKey) {
    throw new Error('OSS API key is missing. Please set VITE_OSS_API_KEY in your .env file.');
  }

  // Ensure URL doesn't end with slash
  const cleanUrl = ossApiUrl.replace(/\/$/, '');

  const response = await fetch(`${cleanUrl}/get-multi-signed-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      files,
    }),
  });

  if (!response.ok) {
    let errorMessage = `Failed to get signed URLs: ${response.status}`;
    
    if (response.status === 401) {
      errorMessage = 'Authentication failed. Please check your VITE_OSS_API_KEY in .env file.';
    } else {
      const errorData = await response.json().catch(() => null);
      if (errorData?.error) {
        errorMessage = errorData.error;
      }
    }
    
    throw new Error(errorMessage);
  }

  const data = await response.json();
  return data.urls || [];
};

/**
 * Get signed URLs for multiple files (same company/branch/type)
 * @param {Array<string>} filenames - Array of file names
 * @param {string} companyCode - Company code (default: 'sre')
 * @param {string} branchCode - Branch code (default: 'test01')
 * @param {string} uploadType - Upload type (default: 'file-upload')
 * @param {number} expires - Expiration time in seconds (default: 3600)
 * @returns {Promise<Array>} Array of { filename, download_url, expires_in }
 */
export const getSameLocationURLs = async (filenames, companyCode = 'sre', branchCode = 'test01', uploadType = 'file-upload', expires = 3600) => {
  const ossApiUrl = getOSSApiURL();
  const apiKey = getOSSApiKey();

  // Validate API key
  if (!apiKey) {
    throw new Error('OSS API key is missing. Please set VITE_OSS_API_KEY in your .env file.');
  }

  // Ensure URL doesn't end with slash
  const cleanUrl = ossApiUrl.replace(/\/$/, '');

  const response = await fetch(`${cleanUrl}/get-same-location-urls`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      filenames,
      company_code: companyCode,
      branch_code: branchCode,
      upload_type: uploadType,
      expires,
    }),
  });

  if (!response.ok) {
    let errorMessage = `Failed to get signed URLs: ${response.status}`;
    
    if (response.status === 401) {
      errorMessage = 'Authentication failed. Please check your VITE_OSS_API_KEY in .env file.';
    } else {
      const errorData = await response.json().catch(() => null);
      if (errorData?.error) {
        errorMessage = errorData.error;
      }
    }
    
    throw new Error(errorMessage);
  }

  const data = await response.json();
  return data.urls || [];
};

