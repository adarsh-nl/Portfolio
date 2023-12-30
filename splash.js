document.addEventListener("DOMContentLoaded", function () {
  // Show the main content after a delay
  setTimeout(function () {
      document.getElementById("splashScreen").style.display = "none";
      document.getElementById("mainContent").style.display = "block";
  }, 4000); // Adjust the delay (in milliseconds) as needed
});
