module.exports = {
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
      '@weacast/leaflet'
    ],
    branch: 'master'
  },
  aktnmap: {
    application: true,
    dependencies: [
      '@kalisio/feathers-distributed',
      '@weacast/core', 
      '@weacast/leaflet',
      '@kalisio/kdk'
    ],
    branch: 'master'
  }
}
