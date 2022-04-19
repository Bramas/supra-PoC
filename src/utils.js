

export function strToData(message) {
    const data = message;
    const bytes = []; // char codes
    for (var i = 0; i < data.length; ++i) {
        bytes.push(data.charCodeAt(i));
    }
    return bytes.map(c => c.toString(16)).join('');
}

export function dataToStr(message) {
    message = message.slice(2); //remove '0x'
    const bytes = [];
    for (var i = 0; i < message.length; i+=2) {
        bytes.push(String.fromCharCode(parseInt(message.slice(i,i+2), 16)));
    }
    return bytes.join('');
}