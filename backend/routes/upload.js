const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const cloudinary = require('../config/cloudinary');
const { protect } = require('../middleware/auth');

router.use(protect);

// Keep the file in memory (as a Buffer) instead of writing to disk —
// we forward it straight to Cloudinary and never need it on our own server.
const storage = multer.memoryStorage();

// 15MB cap — adjust as needed.
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
});

// ── POST /api/upload ───────────────────────────────────────
// Accepts a single file under the field name "file".
// Returns: { success, url, fileName, fileSize, resourceType }
router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file was uploaded.' });
    }

    // Decide the Cloudinary resource_type based on the mimetype.
    let resourceType = 'raw';
    if (req.file.mimetype.startsWith('image/')) resourceType = 'image';
    else if (req.file.mimetype.startsWith('audio/') || req.file.mimetype.startsWith('video/')) resourceType = 'video';

    // Upload the buffer to Cloudinary via an upload_stream
    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: resourceType,
          folder: 'lasu-connect', // keeps uploads organised in your Cloudinary media library
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      stream.end(req.file.buffer);
    });

    res.status(201).json({
      success: true,
      url: uploadResult.secure_url,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      resourceType,
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ success: false, message: 'Upload failed. Please try again.' });
  }
});

module.exports = router;
