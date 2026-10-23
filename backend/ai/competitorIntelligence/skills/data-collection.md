# Data Collection Layer
> id: data_collection · stage: 2 · engine: code — Instagram Graph API

## Role
Collects the data the analysis agents need beyond the competitors:
1. **Your own account** (Instagram Login token): profile + recent posts with likes/comments.
2. **Accessible comments**: comment text on *your* recent posts
   (`GET /{media-id}/comments?fields=text,timestamp,like_count,username`).
   Meta does not give comment text for other brands' posts, so competitor audiences are
   measured through comment counts and comment-to-like ratios instead.

## Rules
- Only posts with at least one comment are read, newest first, up to `maxPostsForComments`.
- Each post: up to `commentsPerPost` comments. Usernames are kept only for de-duplication.
- If the token lacks the comments permission, record a note and continue.

## Config
```json
{ "maxPostsForComments": 15, "commentsPerPost": 50 }
```
