import { LightningElement } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';
import D3 from '@salesforce/resourceUrl/d3';
import topoJSON from '@salesforce/resourceUrl/topojson';
import { RENAMED_COUNTRIES } from './data';
import jsonConfigData from '@salesforce/resourceUrl/worldConfig';

export default class CovidWorldDistributionMap extends LightningElement {

	scriptLoaded = false;
	height;
	width = 1100;
	isLoading = true;
	mapModeChecked = true;
	records = [];
	columns = [];
	sortedBy = "Country";
	sortedDirection = "asc";
	confirmedCount = 'N/A';
	activeCount = 'N/A';
	recoveredCount = 'N/A';
	deathCount = 'N/A';

	_covidData;
	_worldConfig;
	_covidSummaryApiData;

	renderedCallback() {
		if (!this.scriptLoaded) {
			this.isLoading = true;
			Promise.all([
				loadScript(this, D3 + '/d3.min.js'),
				loadScript(this, topoJSON + '/topojson-client.min.js')
			])
			.then(() => {
				this.scriptLoaded = true;
			})
			.catch((error) => {
				console.log("Error:", error);
			})
			.finally(() => {
				this.isLoading = false;
			});
		}

		if(this.mapModeChecked) {
			this.prepareAndDrawMap();
		}
	}

	handleModeChange() {
		this.mapModeChecked = !this.mapModeChecked;
	}

	handleSort(event) {
		const { fieldName, sortDirection } = event.detail;
		const dataToSort = [...this.records];
		this.sortedBy = fieldName;
		this.sortedDirection = sortDirection;
		dataToSort.sort(this.sortDataBy(fieldName, sortDirection));
		this.records = dataToSort;
	}

	async prepareAndDrawMap() {
		if(!this._worldConfig) {
			let request = new XMLHttpRequest();
			request.open("GET", jsonConfigData, false);
			request.send(null);
			this._worldConfig = JSON.parse(request.responseText);
		}

		if(!(this._covidSummaryApiData && this._covidSummaryApiData.length > 0)) {
			this._covidSummaryApiData = await fetch('https://api.covid19api.com/summary', {
				method: "GET",
				headers: {
					"Content-Type": "application/json",
					}
				})
				.then((response) => {
					return response.json();
				});
		}

		if(this._covidSummaryApiData && this._covidSummaryApiData.Countries && this._covidSummaryApiData.Countries.length > 0) {
			const formatCount = window.d3.format(",");
			this.confirmedCount = formatCount(this._covidSummaryApiData.Global.TotalConfirmed);
			this.activeCount = formatCount(this._covidSummaryApiData.Global.TotalConfirmed - (this._covidSummaryApiData.Global.TotalRecovered + this._covidSummaryApiData.Global.TotalDeaths));
			this.recoveredCount = formatCount(this._covidSummaryApiData.Global.TotalRecovered);
			this.deathCount = formatCount(this._covidSummaryApiData.Global.TotalDeaths);
			this.columns = this.prepareColumns();
			this.records = this._covidSummaryApiData.Countries;
			this.prepareData(this._covidSummaryApiData);
			this.drawMap();
		}
	}

	drawMap() {
		const d3 = window.d3,
			topojson = window.topojson;
		const projection = d3.geoEqualEarth(),
			path = d3.geoPath(projection),
			outline = ({type: "Sphere"}),
			countries = topojson.feature(this._worldConfig, this._worldConfig.objects.countries),
			color = d3.scaleSequentialSqrt()
				.domain(d3.extent(Array.from(this._covidData.values())))
				.interpolator(d3.interpolateYlOrRd)
				.unknown("#ccc");
		
		const [[x0, y0], [x1, y1]] = d3.geoPath(projection.fitWidth(this.width, outline)).bounds(outline);
		const dy = Math.ceil(y1 - y0), l = Math.min(Math.ceil(x1 - x0), dy);
		projection.scale(projection.scale() * (l - 1) / l).precision(0.2);

		this.height = dy;

		const svg = d3.select(this.template.querySelector('svg.covidWorldMap'));

		const defs = svg.append("defs");
		defs.append("path")
			.attr("id", "outline")
			.attr("d", path(outline));

		defs.append("clipPath")
			.attr("id", "clip")
			.append("use");
			
		const g = svg.append("g");

		g.append("use")
			.attr("fill", "white");

		// created countries and add tooltip
		g.append("g")
			.selectAll("path")
			.data(countries.features)
			.join("path")
			.attr("fill", d => color(this._covidData.get(d.properties.name)))
			.attr("d", path)
			.append("title")
			.text(d => `${d.properties.name} ${this._covidData.has(d.properties.name) ? this._covidData.get(d.properties.name).toLocaleString() : "N/A"}`);
	  
		// creates country borders
		g.append("path")
			.datum(topojson.mesh(this._worldConfig, this._worldConfig.objects.countries, (a, b) => a !== b))
			.attr("fill", "none")
			.attr("stroke", "white")
			.attr("stroke-linejoin", "round")
			.attr("d", path);

		svg.append("use")
			.attr("fill", "none")
			.attr("stroke", "black");

		this.createColorScale(color);
	}

	createColorScale(color) {
		const d3 = window.d3,
		width = 520,
		height = 50,
		tickSize = 6,
		marginTop = 18,
		marginRight = 0,
		marginBottom = 22,
		marginLeft = 20,
		ticks = 5;
		const svg = d3.select(this.template.querySelector('svg.mapColorScale'))
			.attr("width", width)
			.attr("height", height)
			.attr("viewBox", [0, 0, width, height])
			.style("overflow", "visible")
			.style("display", "block");

		let tickAdjust = g => g.selectAll(".tick line").attr("y1", marginTop + marginBottom - height);
		let colorCopy = Object.assign(color.copy()
			.interpolator(
				d3.interpolateRound(marginLeft, width - marginRight)
			),
			{ range() { return [marginLeft, width - marginRight]; } }
		);

		svg.append("image")
			.attr("x", marginLeft)
			.attr("y", marginTop)
			.attr("width", width - marginLeft - marginRight)
			.attr("height", height - marginTop - marginBottom)
			.attr("preserveAspectRatio", "none")
			.attr("xlink:href", this.ramp(color.interpolator()).toDataURL());

		const n = Math.round(ticks + 1),
			tickValues = d3.range(n).map(i => d3.quantile(color.domain(), i / (n - 1)));

		svg.append("g")
			.attr("transform", `translate(0,${height - marginBottom})`)
			.call(d3.axisBottom(colorCopy)
				.ticks(ticks, undefined)
				.tickSize(tickSize)
				.tickValues(tickValues))
			.call(tickAdjust)
			.call(g => g.select(".domain").remove())
			.call(g => g.append("text")
				.attr("x", marginLeft)
				.attr("y", marginTop + marginBottom - height - 6)
				.attr("fill", "currentColor")
				.attr("text-anchor", "start")
				.attr("font-weight", "bold")
				.attr("class", "title")
				.text("Total Confirmed Cases"));
	}

	ramp(color, n = 256) {
		const canvas = document.createElement("canvas");
		canvas.width = 256;
		canvas.height = 1;
		const context = canvas.getContext("2d");
		for (let i = 0; i < n; ++i) {
			context.fillStyle = color(i / (n - 1));
			context.fillRect(i, 0, 1, 1);
		}
		return canvas;
	}

	sortDataBy(field, sortDirection) {
		// eslint-disable-next-line no-confusing-arrow
		const key = (a) =>
			typeof a[field] === 'string' ? a[field].toLowerCase() : a[field];
		const reverse = sortDirection === 'asc' ? 1 : -1;
		return (a, b) => {
			const x = key(a) || '';
			const y = key(b) || '';
			return reverse * ((x > y) - (y > x));
		};
	};

	prepareData(data) {
		this._covidData = new Map(data.Countries.map(country => 
			new Array(RENAMED_COUNTRIES.has(country.Country) ? RENAMED_COUNTRIES.get(country.Country) : country.Country, country.TotalConfirmed)
		));
	}

	prepareColumns() {
		return [
			{
				label: "Country",
				type: 'text',
				fieldName: "Country",
				sortable: true,
			},
			{
				label: "New Confirmed",
				type: 'text',
				fieldName: "NewConfirmed",
				sortable: true,
			},
			{
				label: "Total Confirmed",
				type: 'text',
				fieldName: "TotalConfirmed",
				sortable: true,
			},
			{
				label: "New Recovered",
				type: 'text',
				fieldName: "NewRecovered",
				sortable: true,
			},
			{
				label: "Total Recovered",
				type: 'text',
				fieldName: "TotalRecovered",
				sortable: true,
			},
			{
				label: "New Deaths",
				type: 'text',
				fieldName: "NewDeaths",
				sortable: true,
			},
			{
				label: "Total Deaths",
				type: 'text',
				fieldName: "TotalDeaths",
				sortable: true,
			},
		];
	}

	get colorMapper() {
		return {
			confirmed: "rgb(54, 6, 212)",
			recovered: "rgb(3, 143, 31)",
			deaths: "rgb(252, 19, 15)",
			active: "rgb(212, 136, 4)"
		}
	}
}