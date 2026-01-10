# OSS Server V2 - Quick API Guide

## Upload Files (2 Steps)

### Step 1: Get Upload URL

**POST** `/get-upload-url`

**Request:**
```json
{
  "files": [
    { "filename": "photo.jpg", "content_type": "image/jpeg" }
  ],
  "company_code": "sre",
  "branch_code": "test01",
  "upload_type": "file-upload"
}
```

**Response:**
```json
{
  "count": 1,
  "uploads": [
    {
      "upload_url": "https://credit-oss-sredoc001.oss-ap-southeast-1.aliyuncs.com/...",
      "download_url": "https://credit-oss-sredoc001.oss-ap-southeast-1.aliyuncs.com/...",
      "final_filename": "2511220900001234_photo.jpg",
      "oss_path": "sre/test01/file-upload/2511220900001234_photo.jpg",
      "headers": { "Content-Type": "image/jpeg" }
    }
  ]
}
```

### Step 2: Upload File to OSS

**PUT** `<upload_url from step 1>`

**Headers:** `Content-Type: image/jpeg`

**Body:** Binary file data

**Response:** `200 OK`

---

## Download/View Files

### Single File (V1 Compatible)

**POST** `/get-signed-url`

**Request:**
```json
{
  "file_name": "2511220900001234_photo.jpg",
  "access_type": "image-upload",
  "company_code": "sre",
  "branch_code": "test01"
}
```

**Response:**
```json
{
  "url": "https://credit-oss-sredoc001.oss-ap-southeast-1.aliyuncs.com/..."
}
```

### Multiple Files (Each with Own Company/Branch/Type)

**POST** `/get-multi-signed-url`

**Request:**
```json
{
  "files": [
    {
      "file_name": "2511220900001234_photo.jpg",
      "access_type": "image-upload",
      "company_code": "sre",
      "branch_code": "branch01"
    },
    {
      "file_name": "2511220900005678_doc.pdf",
      "access_type": "file-upload",
      "company_code": "srm",
      "branch_code": "branch02"
    }
  ]
}
```

**Response:**
```json
{
  "urls": [
    {
      "file_name": "2511220900001234_photo.jpg",
      "url": "https://..."
    },
    {
      "file_name": "2511220900005678_doc.pdf",
      "url": "https://..."
    }
  ]
}
```

### Multiple Files (Same Company/Branch/Type)

**POST** `/get-same-location-urls`

**Request:**
```json
{
  "filenames": ["2511220900001234_photo.jpg", "2511220900005678_photo2.jpg"],
  "company_code": "sre",
  "branch_code": "test01",
  "upload_type": "file-upload",
  "expires": 3600
}
```

**Response:**
```json
{
  "urls": [
    {
      "filename": "2511220900001234_photo.jpg",
      "download_url": "https://credit-oss-sredoc001.oss-ap-southeast-1.aliyuncs.com/...",
      "expires_in": 3600
    },
    {
      "filename": "2511220900005678_photo2.jpg",
      "download_url": "https://...",
      "expires_in": 3600
    }
  ]
}
```

Open any `url` or `download_url` in browser to view/download.

---

**All requests need header:** `x-api-key: YOUR_API_KEY`
