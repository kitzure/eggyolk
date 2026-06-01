var trigger = document.querySelector('.discord-trigger');

trigger.addEventListener('click', function () {
  this.classList.toggle('show-tooltip');
});

document.addEventListener('click', function (e) {
  if (!trigger.contains(e.target)) {
    trigger.classList.remove('show-tooltip');
  }
});
