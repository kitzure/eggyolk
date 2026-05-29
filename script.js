const message = document.getElementById('message');
const button = document.getElementById('sayHelloBtn');

button.addEventListener('click', () => {
  const text = 'print hello word';
  message.textContent = text;
  console.log(text);
});

message.textContent = 'print hello word';
