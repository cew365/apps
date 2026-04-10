const menuBtn = document.getElementById("menuBtn");
const mainNav = document.getElementById("mainNav");
const bookingForm = document.getElementById("bookingForm");
const formStatus = document.getElementById("formStatus");
const yearElement = document.getElementById("year");

menuBtn.addEventListener("click", () => {
  mainNav.classList.toggle("show");
});

bookingForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const name = document.getElementById("name").value.trim();
  const phone = document.getElementById("phone").value.trim();
  const service = document.getElementById("service").value.trim();
  const date = document.getElementById("date").value;

  if (!name || !phone || !service || !date) {
    formStatus.textContent = "Please fill in all required fields.";
    formStatus.classList.add("error");
    formStatus.classList.remove("success");
    return;
  }

  const phonePattern = /^[+]?[\d\s\-()]{7,}$/;
  if (!phonePattern.test(phone)) {
    formStatus.textContent = "Please enter a valid phone number.";
    formStatus.classList.add("error");
    formStatus.classList.remove("success");
    return;
  }

  formStatus.textContent =
    "Thank you! Your request has been submitted. We will contact you soon.";
  formStatus.classList.add("success");
  formStatus.classList.remove("error");
  bookingForm.reset();
});

yearElement.textContent = new Date().getFullYear();
