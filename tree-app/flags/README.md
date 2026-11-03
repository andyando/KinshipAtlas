# Flags Directory

This directory contains SVG images of country flags, organized by aspect ratio and use case.

## Structure

- `1x1/`: Flags with a 1:1 aspect ratio.
- `2x3/`: Flags with a 2:3 aspect ratio.
- `3x2/`: Flags with a 3:2 aspect ratio.
- `4x3/`: Flags with a 4:3 aspect ratio.
- `16x9/`: Flags with a 16:9 aspect ratio.
- `regional/`: Regional or subnational flags (e.g., UK regions).
- `svg/`: (Optional) Metadata or additional information about SVGs.

## Adding New Flags

- Place new flags in the appropriate aspect ratio folder.
- Ensure flag files are named consistently (e.g., `country-code.svg`).
- If the flag represents a region, place it in the `regional/` folder.

## License

All flags are licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

The following PNG flags in `4x3/` were downloaded from [flagcolorcodes.com](https://www.flagcolorcodes.com/) and are subject to that site's terms, not the licence above: `am`, `bm`, `bo`, `cu`, `de-prussia` (State of Prussia 1918–1933), `jm`, `lv`, `pg`, `pr`, `ps`, `sd`, `to`, `ws`.

function loadFlag(countryCode) {
  const flagPath = `flags/4x3/${countryCode}.svg`;
  // Load the flag using flagPath
}

<img src="flags/4x3/ar.svg" alt="Argentina Flag">
<img src="flags/regional/gb.svg" alt="UK Flag">

<button id="searchWikiTree">Search on WikiTree</button>

document.getElementById("searchWikiTree").addEventListener("click", function () {
  // Replace this with the actual data from your app
  const currentPerson = {
    firstName: "John", // Replace with actual value
    middleName: "Doe", // Replace with actual value
    lastName: "Smith", // Replace with actual value
    birthDate: "1900-01-01", // Replace with actual value
    deathDate: "1980-01-01", // Replace with actual value
    parents: "Jane Smith", // Replace with actual value
    birthCountry: "USA", // Replace with actual value
    deathCountry: "USA" // Replace with actual value
  };

  // Check if the person was born before 1930 or is deceased
  const isEligible = currentPerson.birthDate && new Date(currentPerson.birthDate).getFullYear() < 1930 || currentPerson.deathDate;

  if (!isEligible) {
    alert("This person is not eligible for WikiTree search (born after 1930 and not deceased).");
    return;
  }

  // Build the query parameters
  const queryParams = new URLSearchParams({
    format: "json",
    action: "search",
    name: `${currentPerson.firstName} ${currentPerson.middleName} ${currentPerson.lastName}`,
    born: currentPerson.birthDate,
    died: currentPerson.deathDate,
    parents: currentPerson.parents,
    birth_country: currentPerson.birthCountry,
    death_country: currentPerson.deathCountry
  });

  // Make the request to the WikiTree API
  fetch(`https://api.wikitree.com/api.php?${queryParams}`)
    .then(response => response.json())
    .then(data => {
      // Display the results in a popup window
      const resultsWindow = window.open("", "WikiTree Results", "width=800,height=600");
      resultsWindow.document.write("<html><body>");
      resultsWindow.document.write("<h1>WikiTree Search Results</h1>");
      resultsWindow.document.write("<pre>" + JSON.stringify(data, null, 2) + "</pre>");
      resultsWindow.document.write("</body></html>");
    })
    .catch(error => {
      console.error("Error fetching data from WikiTree API:", error);
      alert("An error occurred while searching WikiTree.");
    });
});

