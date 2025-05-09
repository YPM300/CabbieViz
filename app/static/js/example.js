async function queryData() {
    const response = await fetch('/routine/id', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            routine_id:0
        })
    });
    const result = await response.json();
    alert(result.message)
}