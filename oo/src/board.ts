export type Generator<T> = { next: () => T }

export type Position = {
    row: number,
    col: number
}

export type Match<T> = {
    matched: T,
    positions: Position[]
}

export type BoardEvent<T> = {
    kind: string; // 'Move', 'Swap', 'Match', 'Refill'
    match?: Match<T>; // Optional match information
};

export type BoardListener<T> = (event: BoardEvent<T>) => void

export class Board<T> {
    // Board size
    public readonly width: number
    public readonly height: number

    // Listeners
    private listeners: BoardListener<T>[] = []
    // Generator
    private generator: Generator<T>
    // Grid
    private readonly grid: T[][] = []

    // Constructor here
    constructor(generator: Generator<T>, width: number, height: number) {
        this.width = width
        this.height = height
        this.grid = Array.from({length: height}, () => Array.from({length: width}, () => generator.next()))
        this.generator = generator
    }

    // Function that adds a listener to the board
    addListener(listener: BoardListener<T>) {
        this.listeners.push(listener)
    }

    // Function that returns the positions of the board
    positions(): Position[] {
        let positions: Position[] = [];
        for (let row = 0; row < this.height; row++) {
            for (let col = 0; col < this.width; col++) {
                positions.push({row, col});
            }
        }
        return positions;
    }

    // Function that returns the piece at a given position if it comes within the bounds of the board
    piece(p: Position): T | undefined {
        if (p.row < 0 || p.row >= this.height || p.col < 0 || p.col >= this.width) {
            return undefined
        }
        return this.grid[p.row][p.col]
    }

    // Function that returns if the pieces at the given positions can be swapped
    canMove(first: Position, second: Position): boolean {
        // Check if the source and destination positions are the same.
        if (first.row === second.row && first.col === second.col) {
            return false;
        }

        // Check if the source and destination positions are within bounds.
        if (!this.isValidPosition(first) || !this.isValidPosition(second)) {
            return false;
        }

        // Check if the move is valid by ensuring that the source and destination positions
        // are either in the same row or in the same column.
        if (first.row !== second.row && first.col !== second.col) {
            return false;
        }

        // Swap the pieces temporarily.
        const temp = this.grid[first.row][first.col];
        this.grid[first.row][first.col] = this.grid[second.row][second.col];
        this.grid[second.row][second.col] = temp;

        // Check for matches at the source and destination positions and their adjacent positions.
        const isMatch =
            this.hasMatchAt(first) ||
            this.hasMatchAt(second) ||
            this.hasMatchAt({row: first.row, col: first.col + 1}) ||
            this.hasMatchAt({row: first.row, col: first.col - 1}) ||
            this.hasMatchAt({row: second.row, col: second.col + 1}) ||
            this.hasMatchAt({row: second.row, col: second.col - 1});

        // Undo the move
        this.grid[second.row][second.col] = this.grid[first.row][first.col];
        this.grid[first.row][first.col] = temp;

        return isMatch;
    };

    move(first: Position, second: Position) {
        // Check if the pieces at the given positions can be swapped
        if (!this.canMove(first, second)) {
            return false;
        }

        // Swap the pieces
        const temp = this.grid[first.row][first.col];
        this.grid[first.row][first.col] = this.grid[second.row][second.col];
        this.grid[second.row][second.col] = temp;

        // Check for matches at the source and destination positions and their adjacent positions
        const horizontalMatches = this.findHorizontalMatches();
        const verticalMatches = this.findVerticalMatches();

        // Notify listeners for horizontal matches
        horizontalMatches.forEach((match) => {
            this.listeners.forEach((listener) => {
                listener({kind: "Match", match});
            });
        });
        // Notify listeners for vertical matches
        verticalMatches.forEach((match) => {
            this.listeners.forEach((listener) => {
                listener({kind: "Match", match});
            });
        });

        // Check if a refill is needed
        const cascadingMatches = this.findCascadingMatches();

        // Notify listeners of cascading matches
        cascadingMatches.forEach((match) => {
            this.listeners.forEach((listener) => {
                listener({kind: "Match", match});
            });
        });

        // Check if a refill is needed
        if (cascadingMatches.length === 0) {
            this.listeners.forEach((listener) => {
                listener({kind: "Refill"});
            });
        }

        return true;
    }

    // Function that checks if the swap positions are valid
    private isValidPosition(position: Position): boolean {
        return (
            position.row >= 0 &&
            position.row < this.height &&
            position.col >= 0 &&
            position.col < this.width
        );
    }

    // Function that checks if there is a match at a given position
    private hasMatchAt(position: Position): boolean {
        // Indicate how many pieces of the same type are in a row or column
        let samePiece = 1;
        // Get the piece at the given position
        const piece = this.grid[position.row][position.col];

        /**
         * Check if there are 3 or more pieces of the same type in a column (horizontal matches)
         */
        let col = position.col - 1;
        // Check if the piece at the given position is the same as the piece at the position to the left
        while (col >= 0 && this.grid[position.row][col] === piece) {
            samePiece++;
            col--;
        }
        // Check if the piece at the given position is the same as the piece at the position to the right
        col = position.col + 1;
        while (col < this.width && this.grid[position.row][col] === piece) {
            samePiece++;
            col++;
        }
        // If there are 3 piece horizontal match, return true
        if (samePiece >= 3) {
            return true;
        }

        /**
         * Check if there are 3 or more pieces of the same type in a row (vertical matches)
         */
        samePiece = 1;
        // Check if the piece at the given position is the same as the piece at the position above
        let row = position.row - 1;
        while (row >= 0 && this.grid[row][position.col] === piece) {
            samePiece++;
            row--;
        }
        // Check if the piece at the given position is the same as the piece at the position below
        row = position.row + 1;
        while (row < this.height && this.grid[row][position.col] === piece) {
            samePiece++;
            row++;
        }
        // If there are 3 piece vertical match, return true
        if (samePiece >= 3) {
            return true;
        }

        // If there are no matches, return false
        return false;
    }

    private findHorizontalMatches(): Match<T>[] {
        const matches: Match<T>[] = [];

        for (let row = 0; row < this.height; row++) {
            for (let col = 0; col < this.width - 2; col++) {
                const piece = this.grid[row][col];

                if (
                    piece === this.grid[row][col + 1] &&
                    piece === this.grid[row][col + 2]
                ) {
                    const match: Match<T> = {
                        matched: piece,
                        positions: [
                            {row, col},
                            {row, col: col + 1},
                            {row, col: col + 2},
                        ],
                    };
                    matches.push(match);
                }
            }
        }

        return matches;
    }

    private findVerticalMatches(): Match<T>[] {
        const matches: Match<T>[] = [];

        for (let row = 0; row < this.height - 2; row++) {
            for (let col = 0; col < this.width; col++) {
                const piece = this.grid[row][col];

                if (
                    piece === this.grid[row + 1][col] &&
                    piece === this.grid[row + 2][col]
                ) {
                    const match: Match<T> = {
                        matched: piece,
                        positions: [
                            {row, col},
                            {row: row + 1, col},
                            {row: row + 2, col},
                        ],
                    };
                    matches.push(match);
                }
            }
        }

        return matches;
    }

    // Function that checks if there are any cascading matches
    private findCascadingMatches(): Match<T>[] {
        const cascadingMatches: Match<T>[] = [];

        // Start from the bottom row and go up
        for (let row = this.height - 1; row >= 0; row--) {
            for (let col = 0; col < this.width; col++) {
                // Check if the current position is empty.
                if (!this.grid[row][col]) {
                    continue; // Skip empty positions
                }

                // Check if there is an empty position below the current one
                if (row < this.height - 1 && !this.grid[row + 1][col]) {
                    // Swap the pieces to simulate falling.
                    const temp = this.grid[row][col];
                    this.grid[row][col] = this.grid[row + 1][col];
                    this.grid[row + 1][col] = temp;

                    // Check for matches at the new position
                    if (this.hasMatchAt({row: row + 1, col})) {
                        const match: Match<T> = {
                            matched: this.grid[row + 1][col],
                            positions: [{row: row + 1, col}],
                        };
                        cascadingMatches.push(match);
                    }

                    // Swap the pieces back to their original positions
                    this.grid[row + 1][col] = this.grid[row][col];
                    this.grid[row][col] = temp;
                }
            }
        }

        return cascadingMatches;
    }
}
