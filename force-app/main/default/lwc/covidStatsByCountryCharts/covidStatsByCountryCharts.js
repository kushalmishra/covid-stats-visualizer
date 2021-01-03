import { LightningElement } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';
import D3 from '@salesforce/resourceUrl/d3';

export default class CovidStatsByCountryCharts extends LightningElement {

	scriptLoaded = false;
	countryValue;
	countryOptions = [];
	height = 300;
	width = 500
	chartsRendered = false;
	calendarModeChecked = false;
	confirmedCount = 'N/A';
	activeCount = 'N/A';
	recoveredCount = 'N/A';
	deathCount = 'N/A';
	covidCountryData = [];
	confirmedMax = 0;
	recoveredMax = 0;
	deathMax = 0;

	async renderedCallback() {
		if (!this.scriptLoaded) {
			this.isLoading = true;
			await Promise.all([
				loadScript(this, D3 + '/d3.min.js'),
			])
			.then(() => {
				this.scriptLoaded = true;
			})
			.catch((error) => {
				console.log("Error:", error);
			});
		}

		if(!(this.countryOptions.length > 0)) {
			await this.prepareCountryOptions();
		}

		this.isLoading = false;
	}

	async handleCountryChange(event) {
		const countryVal = event.detail.value;
		if(countryVal && countryVal.length > 0) {
			this.chartsRendered = false;
			this.countryValue = countryVal;
			if(this.calendarModeChecked) {
				await this.prepareCalendarData(this.countryValue);
			} else {
				await this.drawCountryLineChart(this.countryValue);
			}
			this.chartsRendered = true;
		}
	}

	handleModeChange() {
		this.calendarModeChecked = !this.calendarModeChecked;
	}

	async prepareCountryOptions() {
		let covidCountries = await fetch('https://api.covid19api.com/countries', {
			method: "GET",
			headers: {
				"Content-Type": "application/json",
				}
			})
			.then((response) => {
				return response.json();
			});

		covidCountries.sort((a,b) => (a.Country > b.Country) ? 1 : ((b.Country > a.Country) ? -1 : 0));
		this.countryOptions = covidCountries.map((country) => {
			return {
				label: country.Country,
				value: country.Slug,
			}
		});
		this.countryValue = this.countryOptions[0].value;
	}

	async prepareCalendarData(country) {
		let covidData = await fetch(`https://api.covid19api.com/country/${country}`, {
				method: "GET",
				headers: {
					"Content-Type": "application/json",
					}
				})
				.then((response) => {
					return response.json();
				});
		let size = covidData.length;
		if(covidData && size > 0) {
			const formatCount = window.d3.format(",");
			this.confirmedCount = formatCount(covidData[size-1].Confirmed);
			this.activeCount = formatCount(covidData[size-1].Active);
			this.recoveredCount = formatCount(covidData[size-1].Recovered);
			this.deathCount = formatCount(covidData[size-1].Deaths);
		}
		this.covidCountryData = this.prepareData(covidData);
	}

	prepareData(data) {
		var confirmedCases = 0;
		var recoveredCases = 0;
		var deathCases = 0;
		let recordsByYear = new Map();
		var normalisedData = [];

		data.forEach(x => {
			let record = {
				...x,
				confirmToday: x.Confirmed - confirmedCases,
				recoverdToday: x.Recovered - recoveredCases,
				deathToday: x.Deaths - deathCases,
				year: new Date(x.Date).getFullYear(),
			};

			confirmedCases = x.Confirmed;
			recoveredCases = x.Recovered;
			deathCases = x.Deaths;
			this.confirmedMax = record.confirmToday > this.confirmedMax? record.confirmToday : this.confirmedMax;
			this.recoveredMax = record.recoverdToday > this.recoveredMax? record.recoverdToday : this.recoveredMax;
			this.deathMax = record.deathToday > this.deathMax? record.deathToday : this.deathMax;

			if(!recordsByYear.has(record.year)) {
				recordsByYear.set(record.year, new Array(record));
			} else {
				recordsByYear.get(record.year).push(record);
			}
		});

		for (const [key, value] of recordsByYear.entries()) {
			normalisedData.push(new Array(key, value));
		}
		return normalisedData;
	}

	async drawCountryLineChart(country) {
		const covidData = await fetch(`https://api.covid19api.com/total/country/${country}`, {
			method: "GET",
			headers: {
				"Content-Type": "application/json",
				}
			})
			.then((response) => {
				return response.json();
			});

		let size = covidData.length;
		if(covidData && size > 0) {
			const formatCount = window.d3.format(",");
			this.prepareCountryCharts(covidData);
			this.confirmedCount = formatCount(covidData[size-1].Confirmed);
			this.activeCount = formatCount(covidData[size-1].Active);
			this.recoveredCount = formatCount(covidData[size-1].Recovered);
			this.deathCount = formatCount(covidData[size-1].Deaths);
		}
	}

	prepareCountryCharts(data) {
		const confirmedData = this.prepareCountryData(data, "Confirmed");
		this.prepareLineChart(confirmedData, 'countryChartConfirmed');

		const activeData = this.prepareCountryData(data, "Active");
		this.prepareLineChart(activeData, 'countryChartActive');

		const recoveredData = this.prepareCountryData(data, "Recovered");
		this.prepareLineChart(recoveredData, 'countryChartRecovered');

		const deathsData = this.prepareCountryData(data, "Deaths");
		this.prepareLineChart(deathsData, 'countryChartDeaths');
	}

	prepareLineChart(data, className) {
		const d3 = window.d3,
			margin = {
				top: 20,
				right: 30,
				bottom: 30,
				left: 70,
			},
			bisectDate = d3.bisector(function(d) { return d.date; }).left,
			formatValue = d3.format(","),
			x = d3.scaleUtc()
				.domain(d3.extent(data, d => d.date))
				.range([margin.left, this.width - margin.right]),
			y = d3.scaleLinear()
				.domain([0, d3.max(data, d => d.value)]).nice()
				.range([this.height - margin.bottom, margin.top]),
			line = d3.line()
				.defined(d => !isNaN(d.value))
				.x(d => x(d.date))
				.y(d => y(d.value)),
			yAxis = g => g
				.attr("transform", `translate(${margin.left},0)`)
				.call(d3.axisLeft(y))
				.call(f => f.select(".domain").remove()),
			xAxis = g => g
				.attr("transform", `translate(0,${this.height - margin.bottom})`)
				.call(d3.axisBottom(x).ticks(this.width / 80).tickSizeOuter(0));

		const svgElement = this.template.querySelector(`svg.${className}`);
		while (svgElement.firstChild) svgElement.removeChild(svgElement.firstChild);
		const svg = d3.select(svgElement);

		svg.append("g")
			.call(xAxis);

		svg.append("g")
			.call(yAxis);

		svg.append("path")
			.datum(data)
			.attr("fill", "none")
			.attr("stroke", this.lineColorMapper[className])
			.attr("stroke-width", 2)
			.attr("stroke-linejoin", "round")
			.attr("stroke-linecap", "round")
			.attr("d", line);

		// eslint-disable-next-line vars-on-top
		var focus = svg.append("g")
			.attr("class", "focus")
			.style("display", "none");

		focus.append("circle")
			.attr("r", 3);

		focus.append("rect")
			.attr("class", "tooltip")
			.attr("width", 70)
			.attr("height", 50)
			.attr("x", 10)
			.attr("y", -22)
			.attr("rx", 4)
			.attr("ry", 4);

		focus.append("text")
			.attr("class", "tooltip-date")
			.attr("x", 18)
			.attr("y", -2);

		focus.append("text")
			.attr("class", "tooltip-count")
			.attr("x", 18)
			.attr("y", 18);

		svg.append("rect")
			.attr("class", "overlay")
			.attr("width", this.width)
			.attr("height", this.height)
			.on("mouseover", function() { focus.style("display", null); })
			.on("mouseout", function() { focus.style("display", "none"); })
			.on("mousemove", mousemove);

		function mousemove() {
			var x0 = x.invert(d3.mouse(this)[0]),
				i = bisectDate(data, x0, 1),
				d0 = data[i - 1],
				d1 = data[i],
				d = x0 - d0.date > d1.date - x0 ? d1 : d0;
			focus.attr("transform", "translate(" + x(d.date) + "," + y(d.value) + ")");
			focus.select(".tooltip-date").text(d.date.toISOString().split('T')[0]);
			focus.select(".tooltip-count").text(formatValue(d.value));
		}
	}

	prepareCountryData(data, type) {
		return data.map(country => {
			return {
				date: new Date(country.Date.slice(0, 10)),
				value: country[type],
			}
		})
	}

	get lineColorMapper() {
		return {
			countryChartConfirmed: "rgb(54, 6, 212)",
			countryChartRecovered: "rgb(3, 143, 31)",
			countryChartDeaths: "rgb(252, 19, 15)",
			countryChartActive: "rgb(212, 136, 4)"
		}
	}

	get showCharts() {
		return this.chartsRendered && !this.calendarModeChecked;
	}

	get showCalendar() {
		return this.chartsRendered && this.calendarModeChecked;
	}
}