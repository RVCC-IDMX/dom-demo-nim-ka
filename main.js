const form = document.querySelector("#my-form")
const nameInput = document.querySelector("#name")
const emailInput = document.querySelector("#email")
const msg = document.querySelector("#msg")
const users = document.querySelector("#users")

form.addEventListener("submit", onSubmit)

function onSubmit(evt) {
    evt.preventDefault()

    msg.replaceChildren()

    if (nameInput.value == "" || emailInput.value == "") {
        const error = document.createElement("div")
        error.appendChild(document.createTextNode(`Please enter all fields`))
        error.classList.add("error")
        msg.appendChild(error)
        
        setTimeout(() => error.remove(), 3000)
    } else {
        const li = document.createElement("li")
        li.appendChild(document.createTextNode(`${nameInput.value} : ${emailInput.value}`))
        users.appendChild(li)

        nameInput.value = ""
        emailInput.value = ""
    }
}