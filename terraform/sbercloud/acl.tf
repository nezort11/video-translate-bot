resource "aws_s3_bucket_ownership_controls" "vtb_storage_ownership" {
  bucket = aws_s3_bucket.video-translate-bot-storage.id
  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

resource "aws_s3_bucket_acl" "vtb_storage_acl" {
  depends_on = [aws_s3_bucket_ownership_controls.vtb_storage_ownership]

  bucket = aws_s3_bucket.video-translate-bot-storage.id
  acl    = "public-read"
}
