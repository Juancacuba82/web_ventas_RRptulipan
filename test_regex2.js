const text = `<a href='https://rpcontainer.com/#gallery'>Link</a> and https://google.com`;
console.log(text.replace(/(?<!href=['"])(https?:\/\/[^\s<"']+)/gi, '<a href="$1">$1</a>'));
