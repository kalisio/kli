module.exports = {
  'feathers-distributed': {
    dependencies: [],
    branch: 'buzzard'
  },
  'weacast-core': {
    organization: 'weacast',
    dependencies: [],
    path: '../weacast',
    branch: 'master'
  },
  'weacast-leaflet': {
    organization: 'weacast',
    dependencies: [
      'weacast-core'
    ],
    path: '../weacast',
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
