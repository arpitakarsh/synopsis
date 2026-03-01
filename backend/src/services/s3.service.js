const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')
const { v4: uuid } = require('uuid')

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
})

async function createPresignedUrl(fileName, fileType) {
  const s3Key   = `contracts/${uuid()}-${fileName}`
  const command = new PutObjectCommand({
    Bucket:      process.env.S3_BUCKET_NAME,
    Key:         s3Key,
    ContentType: fileType || 'application/pdf',
  })
  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 })
  return { uploadUrl, s3Key }
}

module.exports = { createPresignedUrl }