module.exports = {
  'feathers-s3': {
    dependencies: [],
    branch: 'master'
  },
  'feathers-webpush': {
    dependencies: [],
    branch: 'master'
  },
  'feathers-distributed': {
    dependencies: [],
    branch: 'master'
  },
  'weacast': {
    organization: 'weacast',
    packages: {
      'core': {
        dependencies: []
      },
      'leaflet': {
        dependencies: ['@weacast/core']
      }
    },
    branch: 'master'
  },
  kdk: {
    dependencies: [
      '@weacast/core', 
      '@weacast/leaflet',
      '@kalisio/feathers-s3',
      '@kalisio/feathers-webpush'
    ],
    branch: 'master'
  },
  crisis: {
    application: true,
    dependencies: [
      '@kalisio/feathers-distributed',
      '@weacast/core', 
      '@weacast/leaflet',
      '@kalisio/kdk',
      '@kalisio/feathers-s3',
      '@kalisio/feathers-webpush'
    ],
    branch: 'master'
  }
}
