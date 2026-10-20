const releaseDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
});

module.exports = {
  branches: ['main'],
  plugins: [
    '@semantic-release/commit-analyzer',
    ['@semantic-release/release-notes-generator', {
      writerOpts: {
        headerPartial: '## {{version}} — {{date}}\n',
        formatDate: date => releaseDate.format(date),
      },
    }],
    ['@semantic-release/changelog', {
      changelogFile: 'CHANGELOG.md',
      changelogTitle: '# What\'s new\n\nThe releases of Lapka, newest first. The "Check for an update" button in the\nsettings looks at the same releases on GitHub.',
    }],
    ['@semantic-release/npm', { npmPublish: false }],
    ['@semantic-release/git', {
      assets: ['package.json', 'package-lock.json', 'CHANGELOG.md'],
      message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
    }],
    ['@semantic-release/github', {
      draftRelease: true, successComment: false, failComment: false, releasedLabels: false,
    }],
  ],
};
