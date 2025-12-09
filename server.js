const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const morgan = require('morgan');

const app = express();
const PORT = process.env.PORT || 3000;

const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, 'data');
const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');
const PHOTO_DIR = path.join(UPLOADS_DIR, 'photos');
const DB_FILE = path.join(DATA_DIR, 'photos.json');

fs.mkdirSync(PHOTO_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

// 简化的数据存储 - 单用户模式，只存储照片列表
function loadPhotos() {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { photos: [] };
  }
}

function savePhotos(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    fs.mkdirSync(PHOTO_DIR, { recursive: true });
    cb(null, PHOTO_DIR);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname) || '.jpg';
    const base = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, base + ext);
  }
});

const upload = multer({
  storage,
  fileFilter(req, file, cb) {
    if (file.mimetype && file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image uploads are allowed'));
    }
  }
});

app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(ROOT_DIR));

// 根路径重定向到 tree.html
app.get('/', (req, res) => {
  res.redirect('/tree.html');
});

// 获取所有照片
app.get('/api/photos', (req, res) => {
  const data = loadPhotos();
  res.json({ photos: data.photos || [] });
});

// 上传照片
app.post('/api/photos', upload.array('photos', 20), (req, res) => {
  const data = loadPhotos();
  const photos = Array.isArray(data.photos) ? [...data.photos] : [];

  if (Array.isArray(req.files)) {
    req.files.forEach((file) => {
      const relPath = path.relative(ROOT_DIR, file.path).split(path.sep).join('/');
      const urlPath = '/' + relPath;
      photos.push(urlPath);
    });
  }

  data.photos = photos;
  savePhotos(data);

  res.json({ ok: true, photos });
});

// 删除照片
app.post('/api/photos/delete', (req, res) => {
  const { photoUrl } = req.body;
  if (!photoUrl) {
    return res.status(400).json({ ok: false, error: 'Photo URL is required' });
  }

  const data = loadPhotos();
  if (!Array.isArray(data.photos)) {
    return res.status(400).json({ ok: false, error: 'No photos found' });
  }

  const photoIndex = data.photos.indexOf(photoUrl);
  if (photoIndex === -1) {
    return res.status(404).json({ ok: false, error: 'Photo not found' });
  }

  // 从数据库中移除
  data.photos.splice(photoIndex, 1);
  savePhotos(data);

  // 尝试删除文件
  try {
    const cleanPath = photoUrl.startsWith('/') ? photoUrl.substring(1) : photoUrl;
    const filePath = path.join(ROOT_DIR, cleanPath);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    // 文件删除失败不影响结果
  }

  res.json({ ok: true, photos: data.photos });
});

// 全局错误处理
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message === 'Only image uploads are allowed') {
    return res.status(400).json({ error: 'Only image uploads are allowed' });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
