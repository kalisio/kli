module.exports = {
  'feathers-s3': {
    dependencies: [],
    branch: 'master'
  },
  'feathers-webpush': {
    dependencies: [],
    branch: 'master'
  },
  kdk: {
    dependencies: ['@kalisio/feathers-s3', '@kalisio/feathers-webpush']
  },
  kapp: {
    application: true,
    dependencies: ['@kalisio/kdk', '@kalisio/feathers-s3', '@kalisio/feathers-webpush']
  }
}
