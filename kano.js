module.exports = {
  'feathers-distributed': {
    dependencies: [],
    branch: 'master'
  },
  'weacast-core': {
    organization: 'weacast',
    dependencies: [],
    branch: 'master'
  },
  'weacast-leaflet': {
    organization: 'weacast',
    dependencies: [
      'weacast-core'
    ],
    branch: 'master'
  },
  kdk: {
    dependencies: [
      'weacast-core', 
      'weacast-leaflet'
    ]
  },
  kano: {
    application: true,
    dependencies: [
      '@kalisio/feathers-distributed',
      'weacast-core', 
      'weacast-leaflet',
      '@kalisio/kdk']
  }
}
