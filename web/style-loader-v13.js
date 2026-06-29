if (!document.querySelector('link[data-couple-social-style]')) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './social-v13.css?release=13';
  link.dataset.coupleSocialStyle = '1';
  document.head.append(link);
}
